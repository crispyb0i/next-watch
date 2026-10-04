import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function docker(args) {
  const { stdout } = await exec("docker", args, {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server.address().port;
}
