import { createHash } from "node:crypto";
import { execCommand } from "@getpaseo/plugin/server";
import { runAcpProvider } from "@getpaseo/plugin/server/acp";
import type { ProviderConnection, ProviderEvent, ProviderRegistration } from "@getpaseo/plugin/server/provider";
import type { AgencySettings } from "../shared/settings.ts";
import { agencyExecutable, agencyLaunch } from "./launch.ts";
import { copilotCompatibility, copilotConfig } from "./copilot.ts";
import { withProcessTree } from "./process.ts";

export function createAgencyProvider(readSettings: () => Promise<AgencySettings>): ProviderRegistration {
  const acp = runAcpProvider({
    id: "agency-copilot",
    label: "Agency Copilot",
    description: "GitHub Copilot launched and configured by Agency.",
    icon: "assets/provider.svg",
    // Let the host resolve its runtime even when Agency is configured outside PATH.
    command: [process.execPath],
    acpOptions: { startupTimeoutMs: 120_000, loadReplayQuietPeriodMs: 300 },
    transformers: [copilotCompatibility],
  });

  return {
    ...acp,
    async getCatalogCacheKey(options) {
      return createHash("sha256").update(JSON.stringify({
        settings: await readSettings(),
        ...options,
      })).digest("hex");
    },
    async status({ launch }) {
      const settings = await readSettings();
      if (!settings.startupConsent) {
        return { available: false, diagnostic: "Open Settings > Plugins > Agency Wrapper and allow Agency startup. Agency may download its managed CLI and load configured MCP servers." };
      }
      if (!launch) return { available: false, diagnostic: "Paseo did not supply an Agency launch environment." };
      const command = agencyExecutable(settings, { ...launch, command: "agency" });
      try {
        const { stdout } = await execCommand(command, [...launch.args, "--version"], {
          env: launch.env,
          timeout: 5000,
        });
        return {
          available: true,
          diagnostic: `${stdout.trim()}\nExecutable: ${command}\nProfiles: ${settings.profiles.join(", ") || "Agency defaults"}\nDefault MCPs: ${settings.defaultMcps ? "enabled" : "disabled"}`,
        };
      } catch (error) {
        return { available: false, diagnostic: `Cannot run Agency at ${command}: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    async connect(request) {
      if (!request.launch) throw new Error("Paseo did not supply an Agency launch environment.");
      const baseLaunch = { ...request.launch, command: "agency" };
      const connections = new Map<string, Promise<ProviderConnection>>();
      const sessions = new Map<string, ProviderConnection>();
      const requests = new Map<string, ProviderConnection>();
      const listeners = new Set<(event: ProviderEvent) => void>();
      const subscriptions = new Set<() => void>();
      let closed = false;
      let closing: Promise<void> | undefined;
      async function current() {
        const settings = await readSettings();
        if (closed) throw new Error("Agency provider connection is closed.");
        const launch = withProcessTree(agencyLaunch(settings, baseLaunch));
        const key = JSON.stringify(settings);
        let pending = connections.get(key);
        if (!pending) {
          pending = acp.connect({ ...request, launch }).then((connection) => {
            subscriptions.add(connection.onEvent((event) => {
              if ("requestId" in event && event.requestId) requests.delete(event.requestId);
              if (event.type === "session.opened") sessions.set(event.sessionId, connection);
              if (event.type === "session.closed") sessions.delete(event.sessionId);
              const mapped = event.type === "session.config"
                ? { ...event, config: copilotConfig(event.config) } : event;
              for (const listener of listeners) listener(mapped);
            }));
            return connection;
          });
          connections.set(key, pending);
          void pending.catch(() => connections.delete(key));
        }
        return pending;
      }
      const initial = await current();
      return {
        version: initial.version,
        capabilities: initial.capabilities,
        async send(input) {
          if (closed) throw new Error("Agency provider connection is closed.");
          const pending = "requestId" in input ? requests.get(input.requestId) : undefined;
          const connection = pending ?? (input.type === "session.open" || !("sessionId" in input)
            ? await current() : sessions.get(input.sessionId));
          if (!connection) throw new Error(`Unknown Agency session: ${"sessionId" in input ? input.sessionId : ""}`);
          if (input.type === "session.open") sessions.set(input.sessionId, connection);
          if ("requestId" in input) requests.set(input.requestId, connection);
          await connection.send(input);
        },
        close() {
          if (closing) return closing;
          closed = true;
          closing = (async () => {
            const settled = await Promise.allSettled(connections.values());
            try {
              const results = await Promise.allSettled(settled.flatMap((result) =>
                result.status === "fulfilled" ? [result.value.close()] : []));
              const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
              if (failures.length) throw new AggregateError(failures, "Cannot close all Agency connections.");
            } finally {
              for (const remove of subscriptions) remove();
              subscriptions.clear();
              listeners.clear();
              sessions.clear();
              requests.clear();
              connections.clear();
            }
          })();
          return closing;
        },
        onEvent(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
      };
    },
  };
}
