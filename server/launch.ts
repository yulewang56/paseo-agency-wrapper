import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderLaunch } from "@getpaseo/plugin/server/provider";
import { settingsSchema, type AgencySettings } from "../shared/settings.ts";

export function agencyExecutable(settings: AgencySettings, launch: ProviderLaunch): string {
  const executable = settings.executable === "agency" ? launch.command : settings.executable;
  return executable.startsWith("~/") ? join(homedir(), executable.slice(2)) : executable;
}

export function agencyLaunch(values: AgencySettings, launch: ProviderLaunch): ProviderLaunch {
  const settings = settingsSchema.parse(values);
  if (!settings.startupConsent) {
    throw new Error("Allow Agency startup in Settings > Plugins > Agency Wrapper before using this provider.");
  }
  const args = [...launch.args, "copilot"];
  for (const profile of settings.profiles) args.push("--profile", profile);
  for (const mcp of settings.additionalMcps) args.push("--mcp", mcp);
  if (!settings.defaultMcps) args.push("--no-default-mcps");
  if (!settings.configPlugins) args.push("--no-config-plugins");
  if (!settings.orgConfig) args.push("--no-org-config");
  args.push("--acp");
  return { command: agencyExecutable(settings, launch), args, env: launch.env };
}
