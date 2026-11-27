import assert from "node:assert/strict";
import { test } from "node:test";
import type { AcpConfigureContext } from "@getpaseo/plugin/server/acp";
import type { ProviderConfigState } from "@getpaseo/plugin/server/provider";
import { AGENT_MODE, ALLOW_ALL_MODE, PLAN_MODE, copilotCompatibility, copilotConfig } from "./copilot.ts";

const state: ProviderConfigState = {
  mode: AGENT_MODE, models: [], thinkingOptions: [],
  modes: [AGENT_MODE, PLAN_MODE, "https://agentclientprotocol.com/protocol/session-modes#autopilot"]
    .map((id) => ({ id, label: id })),
  settings: [{ type: "select", id: "allow_all", label: "Allow all", value: "on", options: [] }],
};

test("reports Allow All from the native permission option, not autopilot", () => {
  const mapped = copilotConfig(state);
  assert.equal(mapped.mode, ALLOW_ALL_MODE);
  assert.deepEqual(mapped.modes.map((mode) => mode.id), [AGENT_MODE, PLAN_MODE, ALLOW_ALL_MODE]);
  assert.equal(mapped.modes.at(-1)?.isUnattended, true);
  assert.deepEqual(mapped.settings, []);
  assert.equal(state.settings?.length, 1);
});

test("does not offer Allow All without a recognized native permission option", () => {
  const mapped = copilotConfig({ ...state, settings: [], providerOptions: { allow_all: "unknown" } });
  assert.deepEqual(mapped.modes.map((mode) => mode.id), [AGENT_MODE, PLAN_MODE]);
  assert.equal(mapped.mode, AGENT_MODE);
});

function context(value: string) {
  const calls: unknown[] = [];
  const result: AcpConfigureContext = {
    sessionId: "test", config: {
      read: async () => ({ allow_all: value }),
      set: async (id, next) => { calls.push(["set", id, next]); },
    },
    catalog: () => ({ models: [], modes: [] }),
    apply: async (change) => { calls.push(["apply", change]); },
  };
  return { calls, result };
}

test("enters Agent mode before enabling Allow All and disables it before leaving", async () => {
  const entering = context("off");
  assert.equal(await copilotCompatibility.configure?.({ target: "mode", value: ALLOW_ALL_MODE }, entering.result), "handled");
  assert.deepEqual(entering.calls, [["apply", { target: "mode", value: AGENT_MODE }], ["set", "allow_all", "on"]]);
  const leaving = context("on");
  assert.equal(await copilotCompatibility.configure?.({ target: "mode", value: PLAN_MODE }, leaving.result), "pass");
  assert.deepEqual(leaving.calls, [["set", "allow_all", "off"]]);
});

test("rejects unsupported permission transitions without applying them", async () => {
  const unsupported = context("unknown");
  await assert.rejects(async () => copilotCompatibility.configure?.({ target: "mode", value: ALLOW_ALL_MODE }, unsupported.result), /does not expose/);
  assert.deepEqual(unsupported.calls, []);
});
