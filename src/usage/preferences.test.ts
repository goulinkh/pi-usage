import { mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import writeAgentFile from "../../testing/writeAgentFile";
import { loadUsageMode, loadUsagePreferences, readJsonObject, saveUsageMode, SETTINGS_FILE } from "./preferences";

describe("readJsonObject", () => {
	it("returns an empty object for absent and non-object files", async () => {
		expect(await readJsonObject(SETTINGS_FILE)).toEqual({});
		await writeAgentFile("settings.json", []);
		expect(await readJsonObject(SETTINGS_FILE)).toEqual({});
	});
	it("propagates invalid JSON and filesystem errors", async () => {
		await writeAgentFile("settings.json", {});
		await writeFile(SETTINGS_FILE, "invalid");
		await expect(readJsonObject(SETTINGS_FILE)).rejects.toBeInstanceOf(SyntaxError);
		await expect(readJsonObject(process.env.PI_CODING_AGENT_DIR!)).rejects.toThrow();
	});
});

describe("loadUsageMode", () => {
	it("defaults to used with absent or invalid preferences", async () => {
		expect(await loadUsageMode()).toBe("used");
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "invalid" } });
		expect(await loadUsageMode()).toBe("used");
	});
	it("preserves a saved left mode", async () => {
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "left" } });
		expect(await loadUsageMode()).toBe("left");
	});
});

describe("loadUsagePreferences", () => {
	it("defaults absent preferences to used and footer", async () => {
		expect(await loadUsagePreferences()).toEqual({ usageMode: "used", usagePlacement: "footer" });
	});
	it.each(["belowEditor", "inlineFooter"])("loads %s placement with the shared mode", async usagePlacement => {
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "used", usagePlacement } });
		expect(await loadUsagePreferences()).toEqual({ usageMode: "used", usagePlacement });
	});
	it("defaults unknown placement values without losing a valid mode", async () => {
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "used", usagePlacement: "invalid" } });
		expect(await loadUsagePreferences()).toEqual({ usageMode: "used", usagePlacement: "footer" });
	});
});

describe("saveUsageMode", () => {
	it("creates missing directories and settings files", async () => {
		await saveUsageMode("used");
		expect(JSON.parse(await readFile(SETTINGS_FILE, "utf8"))).toEqual({ "pi-usage": { usageMode: "used" } });
	});
	it("preserves unrelated pi preferences and placement when changing mode", async () => {
		await writeAgentFile("settings.json", { theme: "dark", "pi-usage": { usageMode: "left", usagePlacement: "inlineFooter" } });
		await saveUsageMode("used");
		expect(JSON.parse(await readFile(SETTINGS_FILE, "utf8"))).toEqual({ theme: "dark", "pi-usage": { usageMode: "used", usagePlacement: "inlineFooter" } });
	});
	it("rejects invalid or unwritable settings rather than overwriting them", async () => {
		await mkdir(SETTINGS_FILE, { recursive: true });
		await expect(saveUsageMode("left")).rejects.toThrow();
	});
});
