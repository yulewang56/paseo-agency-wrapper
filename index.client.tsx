import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AgencySettingsScreen } from "./client/settings.tsx";
import wrapperIcon from "./client/wrapper.svg";

export default function contribute(client: PluginClientContext) {
  return client.addSettingsScreen({
    id: "launch",
    title: "Agency",
    icon: { svg: wrapperIcon },
    Component: AgencySettingsScreen,
  });
}
