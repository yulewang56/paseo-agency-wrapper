import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultSettings } from "../shared/settings.ts";
import { agencyLaunch } from "./launch.ts";

const launch = { command: "/bin/agency", args: ["--verbosity", "error"], env: { EXAMPLE: "kept" } };

test("refuses launch before download and startup consent", () => {
  assert.throws(() => agencyLaunch(defaultSettings(), launch), /Allow Agency startup/);
});

test("preserves host command, environment and default MCP loading", () => {
  const result = agencyLaunch({ ...defaultSettings(), startupConsent: true }, launch);
  assert.deepEqual(result, { ...launch, args: ["--verbosity", "error", "copilot", "--acp"] });
});

test("builds ordered profiles and whole MCP values with explicit opt-outs", () => {
  const result = agencyLaunch({
    ...defaultSettings(), startupConsent: true, executable: "~/Agency CLI/agency",
    profiles: ["base", "work team"], additionalMcps: ["work: ado --organization myorg"],
    defaultMcps: false, configPlugins: false, orgConfig: false,
  }, launch);
  assert.equal(result.command, join(homedir(), "Agency CLI/agency"));
  assert.deepEqual(result.args, ["--verbosity", "error", "copilot", "--profile", "base",
    "--profile", "work team", "--mcp", "work: ado --organization myorg",
    "--no-default-mcps", "--no-config-plugins", "--no-org-config", "--acp"]);
});
