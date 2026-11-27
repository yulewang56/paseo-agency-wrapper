import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { PROVIDER_CAPABILITIES, type ProviderConnection, type ProviderEvent,
  type ProviderPersistence } from "@getpaseo/plugin/server/provider";
import { defaultSettings } from "../shared/settings.ts";
import { AGENT_MODE, ALLOW_ALL_MODE, PLAN_MODE } from "./copilot.ts";
import { createAgencyProvider } from "./provider.ts";

function observe(connection: ProviderConnection) {
  const events: ProviderEvent[] = [];
  const listeners = new Set<() => void>();
  const remove = connection.onEvent((event) => {
    events.push(event);
    for (const listener of listeners) listener();
  });
  async function wait(predicate: (event: ProviderEvent) => boolean, from = 0): Promise<ProviderEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(check);
        const counts = events.slice(from).reduce<Record<string, number>>((result, event) => {
          const label = event.type === "session.turn" ? `${event.type}:${event.state}` : event.type;
          result[label] = (result[label] ?? 0) + 1;
          return result;
        }, {});
        reject(new Error(`Timed out; events: ${JSON.stringify(counts)}`));
      }, 120_000);
      function check() {
        const failure = events.slice(from).find((event) =>
          event.type === "request.failed" || event.type === "session.runtime_failed");
        if (failure && "error" in failure) {
          clearTimeout(timer); listeners.delete(check);
          reject(new Error(JSON.stringify(failure.error)));
          return;
        }
        const result = events.slice(from).find(predicate);
        if (result) { clearTimeout(timer); listeners.delete(check); resolve(result); }
      }
      listeners.add(check);
      check();
    });
  }
  return { events, wait, remove };
}

test(`real Agency catalog, permission modes, and live settings${process.env.AGENCY_TEST_PROMPT === "1"
  ? ", MCP, streaming cancellation, and resume" : ""}`, {
  skip: !process.env.AGENCY_TEST_EXECUTABLE,
  timeout: 300_000,
}, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "agency-wrapper-test-"));
  const env = Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined));
  const launch = { command: process.execPath, args: [], env };
  let settings = { ...defaultSettings(), startupConsent: true, executable: process.env.AGENCY_TEST_EXECUTABLE!,
    defaultMcps: false, configPlugins: false, orgConfig: false };
  const provider = createAgencyProvider(async () => settings);
  const connections: ProviderConnection[] = [];
  try {
    const connection = await provider.connect({ launch, versions: [1], capabilities: [...PROVIDER_CAPABILITIES] });
    connections.push(connection);
    const seen = observe(connection);
    await connection.send({ type: "catalog", requestId: "catalog", cwd });
    const catalog = await seen.wait((event) => event.type === "catalog");
    assert.equal(catalog.type, "catalog");
    if (catalog.type !== "catalog") throw new Error("Expected a catalog.");
    assert.ok(catalog.catalog.models.length > 0);
    assert.ok(catalog.catalog.modes.some((mode) => mode.id === ALLOW_ALL_MODE));

    const config = {
      cwd, env: {}, persist: true, settings: {}, mode: AGENT_MODE,
      mcpServers: { agency_wrapper_test: { type: "stdio" as const, command: process.execPath,
        args: [fileURLToPath(new URL("./fixtures/mcp.mjs", import.meta.url))],
        env: { AGENCY_TEST_MCP_LOG: join(cwd, "mcp.log") } } },
    };
    await connection.send({ type: "session.open", requestId: "open", sessionId: "original", config, history: "skip" });
    await seen.wait((event) => event.type === "session.ready");
    const opened = seen.events.find((event) => event.type === "session.opened");
    assert.ok(opened?.type === "session.opened" && opened.persistence);
    let persistence: ProviderPersistence = opened.persistence;

    settings = { ...settings, startupConsent: false };
    await assert.rejects(connection.send({ type: "session.open", requestId: "blocked",
      sessionId: "blocked", config, history: "skip" }), /Allow Agency startup/);

    for (const mode of [ALLOW_ALL_MODE, PLAN_MODE, AGENT_MODE]) {
      const from = seen.events.length;
      await connection.send({ type: "session.configure", requestId: `mode:${mode}`,
        sessionId: "original", changes: { mode } });
      await seen.wait((event) => event.type === "request.completed" && event.requestId === `mode:${mode}`, from);
      const configs = seen.events.slice(from).filter((event) => event.type === "session.config");
      const last = configs.at(-1);
      assert.equal(last?.type === "session.config" ? last.config.mode : undefined, mode);
    }
    settings = { ...settings, startupConsent: true };

    if (process.env.AGENCY_TEST_PROMPT === "1") {
      const from = seen.events.length;
      let permissions = 0;
      const responses: Promise<void>[] = [];
      const release = connection.onEvent((event) => {
        if (event.type !== "session.permission") return;
        const action = event.request.actions?.find((action) => action.behavior === "allow");
        permissions++;
        responses.push(connection.send({ type: "session.permission", sessionId: "original",
          permissionId: event.request.id, response: { behavior: "allow", selectedActionId: action?.id } }));
      });
      try {
        await connection.send({ type: "session.prompt", sessionId: "original", prompt: {
          clientMessageId: "mcp-prompt", delivery: "auto", input: { type: "message", content: [{
            type: "text", text: "Call only the ping tool from the agency_wrapper_test MCP server, then reply with its exact result. Do not call other tools or read files.",
          }] },
        } });
        const completed = await seen.wait((event) => event.type === "session.turn" &&
          (event.state === "completed" || event.state === "failed" || event.state === "canceled"), from);
        assert.equal(completed.type === "session.turn" ? completed.state : undefined, "completed");
        assert.match(await readFile(join(cwd, "mcp.log"), "utf8"), /tools\/call/);
        assert.ok(seen.events.slice(from).some((event) => event.type === "timeline.item" &&
          event.item.type === "assistant_message" && event.item.text.includes("agency-wrapper-mcp-ok")));
        await Promise.all(responses);
        console.log(`Real MCP round trip completed; approvals: ${permissions}`);
      } finally { release(); }

      const cancelFrom = seen.events.length;
      await connection.send({ type: "session.prompt", sessionId: "original", prompt: {
        clientMessageId: "cancel-prompt", delivery: "auto", input: { type: "message", content: [{
          type: "text", text: "Without using any tools, write the numbers from 1 to 10000, one number per line.",
        }] },
      } });
      await seen.wait((event) => event.type === "session.turn" && event.state === "started", cancelFrom);
      await seen.wait((event) => event.type === "timeline.item" &&
        event.item.type === "assistant_message" && event.item.text.length > 0, cancelFrom);
      await connection.send({ type: "session.interrupt", requestId: "interrupt", sessionId: "original" });
      await seen.wait((event) => event.type === "session.turn" && event.state === "canceled", cancelFrom);
    }

    // Copilot does not retain an empty session before its first prompt.
    if (process.env.AGENCY_TEST_PROMPT !== "1") return;
    for (const event of seen.events) {
      if (event.type === "session.persistence") persistence = event.persistence;
    }
    await connection.close();
    seen.remove();
    const resumed = await provider.connect({ launch, versions: [1], capabilities: [...PROVIDER_CAPABILITIES] });
    connections.push(resumed);
    const replay = observe(resumed);
    await resumed.send({ type: "session.open", requestId: "resume", sessionId: "restored", config,
      persistence, history: "replay" });
    await replay.wait((event) => event.type === "session.ready");
    const restored = replay.events.find((event) => event.type === "session.opened");
    assert.ok(restored?.type === "session.opened");
    assert.deepEqual(restored.persistence, persistence);
    replay.remove();
  } finally {
    try { await Promise.all(connections.map((connection) => connection.close())); }
    finally { await rm(cwd, { recursive: true, force: true }); }
  }
});
