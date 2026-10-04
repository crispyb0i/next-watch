/**
 * Local provider-contract fixture, not a Neon Auth emulator or auth bypass.
 * The installed Neon client consumes these HTTP responses and the app verifies
 * actual signed JWTs against this fixture's ephemeral JWKS. No identities,
 * passwords, sessions, or signing keys survive teardown. OAuth, email delivery,
 * provider rate limits, and external provider security behavior are not tested.
 */
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const syntheticEmail = /^[^\s@]+@example\.(test|invalid)$/i;
const loopbackOrigin = /^http:\/\/127\.0\.0\.1:\d+$/;

export async function startAuthFixture({ port = 0, allowedOrigin } = {}) {
  const key = await generateKeyPair("ES256");
  const unknownKey = await generateKeyPair("ES256");
  const kid = randomUUID();
  const jwk = {
    ...(await exportJWK(key.publicKey)),
    kid,
    use: "sig",
    alg: "ES256",
  };
  const cookieName = `next_watch_e2e_${randomBytes(8).toString("hex")}`;
  const users = new Map();
  const sessions = new Map();
  const failures = new Map();
  const stats = { requests: {}, rejectedOrigins: 0 };
  let baseUrl;
  let issuer;

  async function signToken(claimOverrides = {}, options = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: issuer,
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
      ...claimOverrides,
    };
    for (const name of Object.keys(claims))
      if (claims[name] === undefined) delete claims[name];
    return new SignJWT(claims)
      .setProtectedHeader({
        alg: "ES256",
        kid: options.unknownKey ? "unknown-fixture-key" : kid,
        typ: "JWT",
      })
      .sign(options.unknownKey ? unknownKey.privateKey : key.privateKey);
  }

  async function tokenFor(user, overrides = {}) {
    return signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      ...overrides,
    });
  }

  function sessionFor(req) {
    const value = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    const session = sessions.get(value);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (value) sessions.delete(value);
      return null;
    }
    return session;
  }

  function setCookie(res, value, maxAge = 3600) {
    res.setHeader(
      "set-cookie",
      `${cookieName}=${value}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
    );
  }

  function respond(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function error(res, status, code, message) {
    respond(res, status, { code, message });
  }

  async function respondSession(res, session, extra = {}) {
    const user = users.get(session.email).user;
    res.setHeader("set-auth-jwt", await tokenFor(user));
    respond(res, 200, {
      ...extra,
      user,
      session: {
        id: session.id,
        token: session.token,
        userId: user.id,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        updatedAt: session.createdAt,
        ipAddress: "127.0.0.1",
        userAgent: "next-watch-local-e2e",
      },
    });
  }

  async function readBody(req) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16_384) throw new Error("body-too-large");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  }

  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    const origin = req.headers.origin;
    if (
      origin &&
      (allowedOrigin ? origin !== allowedOrigin : !loopbackOrigin.test(origin))
    ) {
      stats.rejectedOrigins += 1;
      error(res, 403, "INVALID_ORIGIN", "Only the local test app is allowed.");
      return;
    }
    if (origin) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("access-control-expose-headers", "set-auth-jwt");
      res.setHeader("vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader(
        "access-control-allow-headers",
        "content-type, authorization, x-neon-client-info, x-force-fetch, better-auth-cookie",
      );
      res.writeHead(204);
      res.end();
      return;
    }

    const path = new URL(req.url, "http://127.0.0.1").pathname.replace(
      /^\/api\/auth(?=\/|$)/,
      "",
    );
    stats.requests[path] = (stats.requests[path] ?? 0) + 1;
    const queue = failures.get(path);
    if (queue?.length) {
      error(
        res,
        queue.shift(),
        "FIXTURE_FAILURE",
        "Temporary test provider failure.",
      );
      return;
    }

    try {
      if (req.method === "GET" && path === "/.well-known/jwks.json") {
        respond(res, 200, { keys: [jwk] });
        return;
      }
      if (req.method === "GET" && path === "/get-session") {
        const session = sessionFor(req);
        if (session) await respondSession(res, session);
        else respond(res, 200, null);
        return;
      }
      if (req.method === "GET" && path === "/token") {
        const session = sessionFor(req);
        if (!session) error(res, 401, "UNAUTHORIZED", "No active session.");
        else
          respond(res, 200, {
            token: await tokenFor(users.get(session.email).user),
          });
        return;
      }
      if (req.method === "POST" && path === "/sign-out") {
        const session = sessionFor(req);
        if (session) sessions.delete(session.token);
        setCookie(res, "", 0);
        respond(res, 200, { success: true });
        return;
      }
      if (
        req.method !== "POST" ||
        !["/sign-up/email", "/sign-in/email"].includes(path)
      ) {
        error(
          res,
          404,
          "UNSUPPORTED_FIXTURE_ENDPOINT",
          "Provider endpoint not modeled.",
        );
        return;
      }

      const body = await readBody(req);
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (
        !syntheticEmail.test(email) ||
        password.length < 8 ||
        password.length > 128
      ) {
        error(
          res,
          400,
          "INVALID_INPUT",
          "Use a synthetic email and an 8–128 character password.",
        );
        return;
      }
      let record = users.get(email);
      if (path === "/sign-up/email") {
        if (record) {
          error(
            res,
            422,
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            "User already exists. Use another email.",
          );
          return;
        }
        if (typeof body.name !== "string" || !body.name.trim()) {
          error(res, 400, "INVALID_NAME", "Name is required.");
          return;
        }
        const now = new Date().toISOString();
        const salt = randomBytes(16);
        record = {
          salt,
          passwordHash: scryptSync(password, salt, 32),
          user: {
            id: randomUUID(),
            email,
            name: body.name.trim(),
            emailVerified: true,
            image: null,
            createdAt: now,
            updatedAt: now,
          },
        };
        users.set(email, record);
      } else if (
        !record ||
        !timingSafeEqual(
          scryptSync(password, record.salt, 32),
          record.passwordHash,
        )
      ) {
        error(
          res,
          401,
          "INVALID_EMAIL_OR_PASSWORD",
          "Invalid email or password.",
        );
        return;
      }

      const oldSession = sessionFor(req);
      if (oldSession) sessions.delete(oldSession.token);
      const session = {
        id: randomUUID(),
        token: randomBytes(32).toString("base64url"),
        email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      sessions.set(session.token, session);
      setCookie(res, session.token);
      await respondSession(res, session, {
        redirect: false,
        token: session.token,
      });
    } catch (cause) {
      error(
        res,
        cause instanceof SyntaxError || cause.message === "body-too-large"
          ? 400
          : 500,
        "FIXTURE_REQUEST_ERROR",
        "Local provider could not process the request.",
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  issuer = `http://127.0.0.1:${server.address().port}`;
  baseUrl = `${issuer}/api/auth`;

  return {
    baseUrl,
    issuer,
    jwksUrl: `${baseUrl}/.well-known/jwks.json`,
    signToken,
    async signup(input) {
      const response = await fetch(`${baseUrl}/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          `Local signup failed (${response.status}): ${data.code}`,
        );
      return {
        ...data,
        token: response.headers.get("set-auth-jwt"),
        cookie: response.headers.get("set-cookie").split(";")[0],
      };
    },
    controls: {
      stats,
      listUsers: () => [...users.values()].map(({ user }) => ({ ...user })),
      async issueToken(
        userId,
        { expiresInSeconds = 300, issuer: overrideIssuer, claims = {} } = {},
      ) {
        const record = [...users.values()].find(
          ({ user }) => user.id === userId,
        );
        if (!record) throw new Error("Unknown synthetic user.");
        return tokenFor(record.user, {
          exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
          ...(overrideIssuer ? { iss: overrideIssuer } : {}),
          ...claims,
        });
      },
      failNext(path, status = 503) {
        const queue = failures.get(path) ?? [];
        queue.push(status);
        failures.set(path, queue);
      },
      expireSession(userId) {
        for (const session of sessions.values())
          if (users.get(session.email).user.id === userId)
            session.expiresAt = new Date(0).toISOString();
      },
      // As with the app's external provider, already-issued JWTs remain valid
      // until exp; these controls revoke refresh/session access, not bearer JWTs.
      revokeSessions(userId) {
        for (const [token, session] of sessions)
          if (users.get(session.email).user.id === userId)
            sessions.delete(token);
      },
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      users.clear();
      sessions.clear();
      failures.clear();
    },
  };
}
