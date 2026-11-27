# Agency Wrapper for Paseo

<img src="assets/icon.png" alt="Agency logo" width="48">

Adds **Agency Copilot** as a separate provider. It runs `agency copilot --acp` without changing Paseo's built-in Copilot provider. Agency Claude is not supported yet.

## Install

Requires Paseo `>=0.17.4` and an authenticated [Agency CLI](https://aka.ms/agency) on the Paseo host. Validated on macOS.

```sh
paseo plugin install git:yulewang56/paseo-agency-wrapper
```

In **Settings → your host → Plugins → Agency Wrapper → Agency**, enable **Allow Agency startup** and click **Save settings**. After model discovery, select **Agency Copilot** in a new chat. Until you opt in, the provider is unavailable.

## Configure

- **Executable:** Defaults to `agency` on the host's PATH. Use an absolute path or `~/path` if needed.
- **Profiles and MCPs:** Enter one profile or complete `--mcp` value per line. Agency defaults stay enabled unless you turn them off; Paseo's MCP servers are passed separately over ACP. Avoid duplicate server names.
- **Launch changes:** Start a new agent or reload an existing one after saving.

Agency may download its managed CLI and load configured plugins, MCP servers, and organization settings. It runs with the host user's access; prompts and tool results go to the configured services. Keep credentials out of plugin settings. **Allow All** enables Copilot's automatic approvals, not Autopilot.

For troubleshooting, run `paseo provider diagnostic agency-copilot` or `paseo plugin logs agency-wrapper`.

The plugin code is [MIT licensed](LICENSE). Agency and GitHub branding belong to their respective owners and are not covered by this license. This is an unofficial plugin.
