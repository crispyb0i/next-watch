import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@neondatabase/serverless";
import WebSocket, { WebSocketServer } from "ws";
import { docker, listen } from "./environment.mjs";

const ownershipLabel = "io.next-watch.e2e";
const migrationsDirectory = new URL("../../drizzle/", import.meta.url);
const rawTypes = { getTypeParser: () => (value) => value };

export async function stopDisposableDatabase(containerName) {
  const match = /^next-watch-e2e-([a-f0-9]{32})$/.exec(containerName);
  if (!match) throw new Error("Refusing to remove an unrelated container");
  let owner;
  try {
    owner = await docker([
      "inspect",
      "--format",
      `{{ index .Config.Labels "${ownershipLabel}" }}`,
      containerName,
    ]);
  } catch (error) {
    if (/No such (object|container)/i.test(error.stderr ?? "")) return;
    throw error;
  }
  if (owner !== match[1])
    throw new Error("Refusing to remove a database container we do not own");
  await docker(["rm", "--force", "--volumes", containerName]);
}

function beginTransaction(headers) {
  let statement = "BEGIN";
  const isolation = headers["neon-batch-isolation-level"];
  if (isolation) {
    if (
      !/^(ReadUncommitted|ReadCommitted|RepeatableRead|Serializable)$/.test(
        isolation,
      )
    )
      throw new Error("Unsupported fixture transaction isolation");
    statement += ` ISOLATION LEVEL ${isolation.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase()}`;
  }
  for (const [header, yes, no] of [
    ["neon-batch-read-only", "READ ONLY", "READ WRITE"],
    ["neon-batch-deferrable", "DEFERRABLE", "NOT DEFERRABLE"],
  ]) {
    const value = headers[header];
    if (value !== undefined) {
      if (!["true", "false"].includes(value))
        throw new Error("Invalid fixture transaction option");
      statement += ` ${value === "true" ? yes : no}`;
    }
  }
  return statement;
}

// Use the application's existing Neon driver all the way to real PostgreSQL.
// Only the managed Neon HTTP/WebSocket transport is replaced, on loopback.
export async function createDisposableDatabase() {
  const id = randomUUID().replaceAll("-", "");
  const containerName = `next-watch-e2e-${id}`;
  const databaseName = `next_watch_e2e_${id}`;
  const password = randomUUID(); // Ephemeral fixture credential, never persisted.
  const path = `/${randomUUID()}/sql`;
  const clients = new Set();
  const sockets = new Set();
  let httpServer;
  let websocketServer;
  let proxyServer;
  let stopPromise;
  let containerStarted = false;
  let connectionString;
  let proxyPort;

  const stop = () => {
    stopPromise ??= (async () => {
      httpServer?.closeAllConnections();
      if (httpServer?.listening)
        await new Promise((resolve) => httpServer.close(resolve));
      await Promise.allSettled([...clients].map((client) => client.end()));
      for (const socket of sockets) socket.destroy();
      for (const socket of websocketServer?.clients ?? []) socket.terminate();
      if (websocketServer)
        await new Promise((resolve) => websocketServer.close(resolve));
      if (proxyServer?.listening)
        await new Promise((resolve) => proxyServer.close(resolve));
      if (containerStarted) await stopDisposableDatabase(containerName);
    })();
    return stopPromise;
  };

  async function connect() {
    const client = new Client({ connectionString });
    Object.assign(client.neonConfig, {
      webSocketConstructor: WebSocket,
      wsProxy: () => `127.0.0.1:${proxyPort}`,
      useSecureWebSocket: false,
      forceDisablePgSSL: true,
      pipelineConnect: false,
    });
    clients.add(client);
    try {
      await client.connect();
      return client;
    } catch (error) {
      clients.delete(client);
      await client.end().catch(() => {});
      throw error;
    }
  }

  async function withClient(callback) {
    const client = await connect();
    try {
      return await callback(client);
    } finally {
      clients.delete(client);
      await client.end();
    }
  }

  async function query(sql, params = []) {
    return withClient(async (client) => {
      const result = await client.query(sql, params);
      return Array.isArray(result) ? result.at(-1) : result;
    });
  }

  try {
    // No pulls, bind only loopback, and store all DB files in disposable memory.
    // Other containers, volumes, images, and networks are never changed.
    await docker(["image", "inspect", "postgres:18"]);
    containerStarted = true;
    await docker([
      "run",
      "--detach",
      "--rm",
      "--pull=never",
      "--name",
      containerName,
      "--label",
      `${ownershipLabel}=${id}`,
      "--publish",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql:rw,size=256m",
      "--env",
      `POSTGRES_DB=${databaseName}`,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      "postgres:18",
    ]);
    const binding = await docker(["port", containerName, "5432/tcp"]);
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
      throw new Error("Disposable database must bind only to IPv4 loopback");
    const pgPort = Number(binding.split(":")[1]);
    connectionString = `postgresql://postgres:${password}@127.0.0.1:${pgPort}/${databaseName}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await docker([
          "exec",
          containerName,
          "pg_isready",
          "--host=127.0.0.1",
          "--username=postgres",
          `--dbname=${databaseName}`,
        ]);
        ready = true;
        break;
      } catch {
        await delay(250);
      }
    }
    if (!ready) throw new Error("Disposable PostgreSQL did not become ready");

    proxyServer = createServer();
    websocketServer = new WebSocketServer({ server: proxyServer });
    websocketServer.on("connection", (websocket) => {
      // A fixed target prevents this fixture from becoming an arbitrary proxy.
      const socket = createConnection({ host: "127.0.0.1", port: pgPort });
      sockets.add(socket);
      websocket.on("message", (chunk) => socket.write(chunk));
      websocket.on("close", () => socket.destroy());
      websocket.on("error", () => socket.destroy());
      socket.on("data", (chunk) => {
        if (websocket.readyState === WebSocket.OPEN) websocket.send(chunk);
      });
      socket.on("error", () => websocket.terminate());
      socket.on("close", () => {
        sockets.delete(socket);
        websocket.close();
      });
    });
    proxyPort = await listen(proxyServer);

    const migrations = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}.*\.sql$/.test(name))
      .sort();
    for (const name of migrations)
      await query(await readFile(new URL(name, migrationsDirectory), "utf8"));

    httpServer = createServer(async (request, response) => {
      if (
        request.method !== "POST" ||
        request.url !== path ||
        request.headers["neon-connection-string"] !== connectionString
      ) {
        response.writeHead(403).end();
        return;
      }
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 4 * 1024 * 1024)
            throw new Error("Fixture query too large");
          chunks.push(chunk);
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const batch = Array.isArray(payload.queries);
        const queries = batch ? payload.queries : [payload];
        if (
          !queries.length ||
          queries.some(
            (entry) =>
              typeof entry.query !== "string" || !Array.isArray(entry.params),
          )
        )
          throw new Error("Invalid Neon query payload");
        const results = await withClient(async (client) => {
          if (batch) await client.query(beginTransaction(request.headers));
          try {
            const results = [];
            for (const entry of queries) {
              const result = await client.query({
                text: entry.query,
                values: entry.params,
                rowMode: "array",
                types: rawTypes,
              });
              results.push({
                command: result.command,
                rowCount: result.rowCount,
                fields: result.fields,
                rows: result.rows,
              });
            }
            if (batch) await client.query("COMMIT");
            return results;
          } catch (error) {
            if (batch) await client.query("ROLLBACK");
            throw error;
          }
        });
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(batch ? { results } : results[0]));
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" }).end(
          JSON.stringify({
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            table: error.table,
          }),
        );
      }
    });
    const httpPort = await listen(httpServer);
    return {
      containerName,
      ownership: { label: ownershipLabel, value: id },
      connectionString,
      migrations,
      query,
      stop,
      close: stop,
      env: {
        NODE_ENV: "test",
        NEXT_WATCH_E2E: "1",
        NEXT_WATCH_E2E_NEON_ENDPOINT: `http://127.0.0.1:${httpPort}${path}`,
        DATABASE_URL: connectionString,
        TEST_DATABASE_URL: connectionString,
        NEXT_WATCH_TEST_DATABASE: "1",
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
