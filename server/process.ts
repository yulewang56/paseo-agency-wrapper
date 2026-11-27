import type { ProviderLaunch } from "@getpaseo/plugin/server/provider";

const supervisor = String.raw`
import { spawn } from "node:child_process";
const child = spawn(process.argv[1], process.argv.slice(2), {
  detached: true,
  stdio: "inherit",
});
function stopGroup(signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") {
      console.error("Cannot stop the Agency process group:", error);
      process.exitCode = 1;
    }
  }
}
child.once("error", (error) => {
  console.error("Cannot start Agency:", error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  stopGroup("SIGKILL");
  process.exit(process.exitCode || code || (signal ? 1 : 0));
});
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    stopGroup(signal);
    setTimeout(() => {
      stopGroup("SIGKILL");
      process.exit(1);
    }, 700);
  });
}
`;

export function withProcessTree(launch: ProviderLaunch): ProviderLaunch {
  // The host's Windows helper already uses taskkill /T; POSIX needs a process group.
  return process.platform === "win32" ? launch : {
    ...launch,
    command: process.execPath,
    args: ["--input-type=module", "--eval", supervisor, "--", launch.command, ...launch.args],
    env: { ...launch.env, ELECTRON_RUN_AS_NODE: "1" },
  };
}
