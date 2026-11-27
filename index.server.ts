import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createAgencyProvider } from "./server/provider.ts";
import { agencySettings } from "./shared/settings.ts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(agencySettings);
  server.registerProvider(createAgencyProvider(async () => {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(`Invalid Agency settings: ${state.error}`);
    return state.values;
  }));
  return () => {};
}
