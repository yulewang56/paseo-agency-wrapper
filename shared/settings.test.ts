import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings, parseSettingsForm, settingsSchema } from "./settings.ts";

test("parses multiline profiles and MCP values without shell splitting", () => {
  const parsed = parseSettingsForm({
    ...defaultSettings(), profiles: "base\r\n\nwork team\r\n",
    additionalMcps: "work: ado --organization myorg\n",
  });
  assert.deepEqual(parsed.profiles, ["base", "work team"]);
  assert.deepEqual(parsed.additionalMcps, ["work: ado --organization myorg"]);
});

test("rejects relative executable paths and injected argument lines", () => {
  for (const executable of ["./agency", "bin/agency", "agency\n--allow-all", "--version"]) {
    assert.equal(settingsSchema.safeParse({ executable }).success, false, executable);
  }
  assert.equal(settingsSchema.safeParse({ profiles: ["--allow-all"] }).success, false);
  assert.equal(settingsSchema.safeParse({ additionalMcps: ["ado\0mail"] }).success, false);
  for (const executable of ["agency", "~/bin/agency", "/opt/Agency CLI/agency", "C:\\Agency\\agency.exe"]) {
    assert.equal(settingsSchema.safeParse({ executable }).success, true, executable);
  }
});
