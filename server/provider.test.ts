import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings } from "../shared/settings.ts";
import { createAgencyProvider } from "./provider.ts";

const launch = { command: "/does-not-exist/agency", args: [], env: {} };

test("startup is unavailable and connections are rejected until explicitly authorized", async () => {
  const provider = createAgencyProvider(async () => defaultSettings());
  const status = await provider.status!({ launch });
  assert.equal(status.available, false);
  assert.match(status.diagnostic!, /allow Agency startup/);
  await assert.rejects(provider.connect({ launch, versions: [1], capabilities: [] }), /Allow Agency startup/);
});

test("a missing Agency executable produces an explicit diagnostic", async () => {
  const provider = createAgencyProvider(async () => ({ ...defaultSettings(),
    startupConsent: true, executable: launch.command }));
  const status = await provider.status!({ launch });
  assert.equal(status.available, false);
  assert.match(status.diagnostic!, /Cannot run Agency at \/does-not-exist\/agency/);
});
