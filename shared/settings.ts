import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const argument = z.string().trim().min(1).refine(
  (value) => !/[\0\r\n]/.test(value) && !value.startsWith("-"),
  "Use one value per line, without a leading dash or control characters.",
);

export const settingsSchema = z.object({
  startupConsent: z.boolean().default(false),
  executable: z.string().trim().min(1).refine(
    (value) => !/[\0\r\n]/.test(value) && !value.startsWith("-") && (
      !/[\\/]/.test(value) || /^(?:\/|~\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
    ),
    "Use a command name, an absolute host path, or ~/path. Do not include arguments.",
  ).default("agency"),
  profiles: z.array(argument).max(32).default([]),
  additionalMcps: z.array(argument).max(64).default([]),
  defaultMcps: z.boolean().default(true),
  configPlugins: z.boolean().default(true),
  orgConfig: z.boolean().default(true),
}).strict();

export type AgencySettings = z.output<typeof settingsSchema>;
export const defaultSettings = (): AgencySettings => settingsSchema.parse({});

export const agencySettings = defineSettings({
  id: "launch",
  scope: "host",
  version: 1,
  schema: settingsSchema,
});

export function parseSettingsForm(form: Omit<AgencySettings, "profiles" | "additionalMcps"> & {
  profiles: string;
  additionalMcps: string;
}): AgencySettings {
  const lines = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return settingsSchema.parse({
    ...form,
    profiles: lines(form.profiles),
    additionalMcps: lines(form.additionalMcps),
  });
}
