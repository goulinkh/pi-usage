import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_USAGE_MODE, DEFAULT_USAGE_PLACEMENT } from "./constants";
import { asObject } from "./domain";
import type { JsonObject, PercentMode, UsagePreferences } from "./types";

export const SETTINGS_KEY = "pi-usage";

const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
export const AUTH_FILE = path.join(agentDir, "auth.json");
export const SETTINGS_FILE = path.join(agentDir, "settings.json");

/** Read a JSON object, treating absent files and non-object values as empty.
 * @note Performs filesystem I/O and propagates parse and non-ENOENT failures.
 */
export async function readJsonObject(file: string): Promise<JsonObject> {
	try {
		return asObject(JSON.parse(await fs.readFile(file, "utf8"))) ?? {};
	} catch (error) {
		if (asObject(error)?.code === "ENOENT") return {};
		throw error;
	}
}

async function writeJson(file: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Read display mode and placement together, defaulting invalid or absent values.
 * @note Reads pi's settings file once for a consistent preference snapshot.
 */
export async function loadUsagePreferences(): Promise<UsagePreferences> {
	const preferences = asObject((await readJsonObject(SETTINGS_FILE))[SETTINGS_KEY]);
	const usageMode = preferences?.usageMode;
	const usagePlacement = preferences?.usagePlacement;
	return {
		usageMode: usageMode === "left" || usageMode === "used" ? usageMode : DEFAULT_USAGE_MODE,
		usagePlacement: usagePlacement === "belowEditor" || usagePlacement === "inlineFooter" ? usagePlacement : DEFAULT_USAGE_PLACEMENT,
	};
}

/** Read the shared display mode, defaulting invalid or absent values to left.
 * @note Reads pi's settings file.
 */
export async function loadUsageMode(): Promise<PercentMode> {
	return (await loadUsagePreferences()).usageMode;
}

/** Persist the shared display preference while preserving unrelated pi settings.
 * @note Creates the agent directory if needed and rewrites its settings file.
 */
export async function saveUsageMode(usageMode: PercentMode): Promise<void> {
	const settings = await readJsonObject(SETTINGS_FILE);
	settings[SETTINGS_KEY] = { ...asObject(settings[SETTINGS_KEY]), usageMode };
	await writeJson(SETTINGS_FILE, settings);
}
