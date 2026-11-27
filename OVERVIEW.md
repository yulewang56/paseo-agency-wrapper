# Agency Copilot

Run Agency-managed GitHub Copilot inside Paseo, with a separate provider entry and the Agency icon. Existing Copilot agents are not changed.

Agency must already be installed and authenticated on the daemon host. Requires Paseo daemon and app 0.17.4 or later. Open the plugin settings to choose the executable, existing Agency profiles, and additional MCP servers. Default MCPs, configured plugins, and organization configuration can be enabled or disabled separately.

Agency startup is off until explicitly authorized in the plugin settings. Enabling it allows Agency to download or update its managed CLI and load configured services during discovery and agent launches. Disabling startup does not terminate agents already running.

Messages, tool activity, approvals, cancellation, and session restoration use Paseo's ACP adapter. Allow All uses Copilot's permission option, not its autonomous autopilot mode. Model and control availability depend on the installed managed CLI. Claude is not included.

macOS is the validated host platform. Copilot can ignore a stop request while a prompt is starting; retry after output begins. Empty sessions are retained only after their first prompt.

The plugin runs with the daemon user's access and environment. Host settings are shared by authorized clients and are not a credential vault. Authentication remains with Agency/Copilot. Prompts and tool results go to Agency/Copilot's selected services, and configured MCP servers receive their tool requests. Agency can create its own logs and caches. The plugin does not add telemetry.
