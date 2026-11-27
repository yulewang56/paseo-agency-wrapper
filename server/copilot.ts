import type { AcpTransformer } from "@getpaseo/plugin/server/acp";
import type { ProviderConfigState, ProviderMode } from "@getpaseo/plugin/server/provider";

export const AGENT_MODE = "https://agentclientprotocol.com/protocol/session-modes#agent";
export const PLAN_MODE = "https://agentclientprotocol.com/protocol/session-modes#plan";
const AUTOPILOT_MODE = "https://agentclientprotocol.com/protocol/session-modes#autopilot";
export const ALLOW_ALL_MODE = "allow-all";

function modesFor(modes: readonly ProviderMode[], allowAllSupported: boolean): ProviderMode[] {
  const visible = modes.filter((mode) => mode.id !== AUTOPILOT_MODE && mode.id !== ALLOW_ALL_MODE);
  return allowAllSupported ? [...visible, {
    id: ALLOW_ALL_MODE,
    label: "Allow All",
    description: "Automatically approve Copilot tool, path, and URL requests.",
    icon: "ShieldOff",
    colorTier: "dangerous",
    isUnattended: true,
  }] : visible;
}

export function copilotConfig(state: ProviderConfigState): ProviderConfigState {
  const setting = state.settings?.find((entry) => entry.id === "allow_all");
  const value = state.providerOptions?.allow_all ?? setting?.value;
  const supported = value === "on" || value === "off";
  return {
    ...state,
    mode: value === "on" ? ALLOW_ALL_MODE : state.mode === AUTOPILOT_MODE ? AGENT_MODE : state.mode,
    modes: modesFor(state.modes, supported),
    controls: state.controls?.filter((control) => control.key !== "allow_all"),
    settings: state.settings?.filter((entry) => entry.id !== "allow_all"),
  };
}

export const copilotCompatibility: AcpTransformer = {
  async discover(catalog, context) {
    const config = await context.config.read();
    return {
      ...catalog,
      modes: modesFor(catalog.modes, config.allow_all === "on" || config.allow_all === "off"),
      defaultMode: config.allow_all === "on" ? ALLOW_ALL_MODE
        : catalog.defaultMode === AUTOPILOT_MODE ? AGENT_MODE : catalog.defaultMode,
    };
  },
  async configure(change, context) {
    if (change.target !== "mode") return "pass";
    if (change.value === AUTOPILOT_MODE) {
      throw new Error("Native Copilot autopilot is not supported by this provider. Choose Agent, Plan, or Allow All.");
    }
    const config = await context.config.read();
    if (change.value === ALLOW_ALL_MODE) {
      if (config.allow_all !== "on" && config.allow_all !== "off") {
        throw new Error("This Copilot CLI does not expose the allow_all option.");
      }
      await context.apply({ target: "mode", value: AGENT_MODE });
      await context.config.set("allow_all", "on");
      return "handled";
    }
    if (config.allow_all === "on") await context.config.set("allow_all", "off");
    return "pass";
  },
};
