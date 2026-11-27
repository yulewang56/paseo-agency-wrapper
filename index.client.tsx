import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AgencySettingsScreen } from "./client/settings.tsx";
import agencyLogo from "./client/agency.svg";

export default function contribute(client: PluginClientContext) {
  return client.addSettingsScreen({
    id: "launch",
    title: "Agency",
    icon: { svg: agencyLogo },
    Component: AgencySettingsScreen,
  });
}
