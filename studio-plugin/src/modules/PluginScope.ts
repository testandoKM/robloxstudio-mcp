// Optional scope for running a complete temporary plugin beside an installed
// copy. With no root attribute every name and settings operation is unchanged.
import type { SettingsStore } from "./PlaytestTickets";

let root: Instance = script;
while (root.Parent !== undefined && !root.Parent.IsA("Plugin")) root = root.Parent;
const value = root.GetAttribute("MCPIsolationScope");
if (value !== undefined && (!typeIs(value, "string") || value.size() > 48 || value.match("^[%w_]+$")[0] === undefined)) {
	error("Invalid MCPIsolationScope; use 1..48 letters, digits or underscores.");
}
const scope = value as string | undefined;

function name(base: string): string {
	return scope === undefined ? base : `${base}_${scope}`;
}

function settings(plugin: SettingsStore): SettingsStore {
	if (scope === undefined) return plugin;
	return {
		GetSetting(key) { return plugin.GetSetting(name(key)); },
		SetSetting(key, data) { plugin.SetSetting(name(key), data); },
	};
}

export = { name, settings, isolated: scope !== undefined };
