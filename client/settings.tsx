import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { usePaseo, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { agencySettings, parseSettingsForm, type AgencySettings } from "../shared/settings.ts";
import wrapperIcon from "./wrapper.svg";

const formFor = (values: AgencySettings) => ({
  ...values,
  profiles: values.profiles.join("\n"),
  additionalMcps: values.additionalMcps.join("\n"),
});

export function AgencySettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(agencySettings);
  const paseo = usePaseo();
  const [form, setForm] = useState<ReturnType<typeof formFor>>();
  const [revision, setRevision] = useState("");
  const [dirty, setDirty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currentRevision = settings.status === "ready" ? settings.revision : undefined;

  useEffect(() => {
    if (settings.status === "ready" && !dirty) {
      setForm(formFor(settings.values));
      setRevision(settings.revision);
    }
  }, [currentRevision, dirty]);

  const colors = theme.colors;
  const muted = { color: colors.foregroundMuted, fontSize: 13, lineHeight: 20 };
  const busy = settings.saving || refreshing;
  function update(patch: Partial<ReturnType<typeof formFor>>) {
    setForm((current) => current && ({ ...current, ...patch }));
    setDirty(true);
    setError("");
    setMessage("");
  }

  async function save() {
    if (!form) return;
    setError("");
    setMessage("");
    try {
      const values = parseSettingsForm(form);
      if (!await settings.save(values, revision)) return;
      setDirty(false);
      setMessage("Settings saved. Reload existing agents to apply launch changes.");
      setRefreshing(true);
      await paseo.providers.refresh({ providers: ["agency-copilot"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  }

  async function reload() {
    try {
      await settings.reload();
      setDirty(false);
      setError("");
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const field = (key: "executable" | "profiles" | "additionalMcps", label: string, hint: string) => (
    <View style={{ padding: 16, gap: 8 }}>
      <Text style={{ color: colors.foreground, fontWeight: "600" }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={form?.[key] ?? ""}
        onChangeText={(text) => update({ [key]: text })} editable={!busy}
        multiline={key !== "executable"} autoCapitalize="none" autoCorrect={false}
        placeholder={key === "executable" ? "agency" : "One value per line"}
        placeholderTextColor={colors.foregroundMuted}
        style={{ color: colors.foreground, backgroundColor: colors.surface0,
          borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12,
          minHeight: key === "executable" ? 44 : 88, textAlignVertical: "top" }} />
      <Text style={muted}>{hint}</Text>
    </View>
  );

  const button = (label: string, action: () => void, disabled: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled, busy }} disabled={disabled} onPress={action}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 18, borderRadius: 8,
        justifyContent: "center", borderColor: colors.border, borderWidth: 1,
        backgroundColor: colors.surface1, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: colors.foreground, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 20, backgroundColor: colors.surface0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon icon={{ svg: wrapperIcon }} size={40} color={colors.foreground} />
        <Text accessibilityRole="header" style={{ color: colors.foreground,
          fontSize: layout.compact ? 22 : 26, fontWeight: "600" }}>Agency</Text>
      </View>
      <Text style={muted}>Launch Agency on this host using your own account, profiles, plugins, and MCP configuration. The regular Copilot provider is unchanged.</Text>

      {settings.status === "loading" && <Text style={muted}>Loading host settings...</Text>}
      {(settings.status === "error" || settings.status === "invalid") &&
        <Text accessibilityRole="alert" selectable style={{ color: colors.statusDanger }}>{settings.error}</Text>}

      {settings.status === "ready" && form && <>
        <SettingsSection title="Startup permission">
          <SettingsCard>
            <SettingsSwitch label="Allow Agency startup" value={form.startupConsent}
              hint="Agency may download or update its managed CLI and load organization configuration, plugins, and MCP servers. Enable and save only if you trust this setup."
              disabled={busy} onValueChange={(startupConsent) => update({ startupConsent })} />
          </SettingsCard>
          <Text style={muted}>Off by default: installing this plugin does not launch Agency. Turning it off blocks new connections; it does not stop agents already running.</Text>
        </SettingsSection>

        <SettingsSection title="Launch configuration">
          <SettingsCard>
            {field("executable", "Agency executable", "Command name on the daemon PATH, an absolute host path, or ~/path. Do not include arguments.")}
            {field("profiles", "Profiles", "Optional. Each line adds --profile; later profiles override earlier ones. Profiles must already exist in your Agency configuration.")}
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="MCPs and configuration">
          <SettingsCard>
            <SettingsSwitch label="Load Agency default MCPs" value={form.defaultMcps}
              hint="Turning this off does not disable MCPs from profiles, Agent definitions, other configuration sources, or Paseo."
              disabled={busy} onValueChange={(defaultMcps) => update({ defaultMcps })} />
            <SettingsSwitch label="Load configured Agency plugins" value={form.configPlugins}
              hint="Uses plugins.default from Agency configuration."
              disabled={busy} onValueChange={(configPlugins) => update({ configPlugins })} />
            <SettingsSwitch label="Load organization configuration" value={form.orgConfig}
              hint="Agency may contact your organization services while starting."
              disabled={busy} onValueChange={(orgConfig) => update({ orgConfig })} />
            {field("additionalMcps", "Additional MCPs", "Each line is one --mcp value, for example ado or work_ado: ado --organization myorg. Do not enter tokens here.")}
          </SettingsCard>
        </SettingsSection>

        {dirty && settings.revision !== revision &&
          <Text accessibilityRole="alert" style={{ color: colors.statusWarning }}>Another client changed these settings. Your draft is preserved; reload before saving to avoid a conflict.</Text>}
      </>}

      {!!(error || settings.saveError) && <Text accessibilityRole="alert" selectable
        style={{ color: colors.statusDanger }}>{error || settings.saveError}</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{message}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {button(busy ? "Saving / refreshing..." : "Save settings", () => void save(),
          busy || !dirty || settings.status !== "ready")}
        {button(dirty ? "Discard draft and reload" : "Reload settings", () => void reload(),
          busy || settings.status === "loading")}
      </View>
      <Text style={muted}>Settings are shared by authorized clients of this host. Credentials stay in Agency's existing authentication storage, not in this plugin. Prompts and tool results go to Agency/Copilot's configured services.</Text>
    </View>
  );
}
