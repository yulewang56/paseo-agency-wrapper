import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { spawnProcess } from "@getpaseo/plugin/server";
import { withProcessTree } from "./process.ts";

test("terminates Agency descendants holding ACP pipes open and preserves argv", {
  skip: process.platform === "win32", timeout: 10_000,
}, async () => {
  const descendant = `process.on("SIGTERM", () => {});
    console.log(JSON.stringify({ pid: process.pid, args: process.argv.slice(1), marker: process.env.AGENCY_TEST_MARKER }));
    setInterval(() => {}, 1000);`;
  const parent = `const { spawn } = require("node:child_process");
    process.on("SIGTERM", () => {});
    spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}, ...process.argv.slice(1)], { stdio: "inherit" });
    setInterval(() => {}, 1000);`;
  const launch = withProcessTree({ command: process.execPath,
    args: ["-e", parent, "profile with spaces", "literal;not-a-shell-command"],
    env: { ...process.env, AGENCY_TEST_MARKER: "kept" } });
  const child = spawnProcess(launch.command, launch.args, { env: launch.env, stdio: "pipe" });
  const lifetime = new AbortController();
  const deadline = setTimeout(() => lifetime.abort(), 5000);
  let descendantPid: number | undefined;
  try {
    const [data] = await once(child.stdout!, "data", { signal: lifetime.signal });
    const reported = JSON.parse(String(data));
    descendantPid = reported.pid;
    assert.deepEqual(reported.args, ["profile with spaces", "literal;not-a-shell-command"]);
    assert.equal(reported.marker, "kept");
    const closed = once(child, "close", { signal: lifetime.signal });
    child.kill("SIGTERM");
    await closed;
    assert.throws(() => process.kill(descendantPid!, 0), { code: "ESRCH" });
  } finally {
    clearTimeout(deadline);
    child.kill("SIGTERM");
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
  }
});
