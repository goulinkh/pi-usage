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
	it("defaults to left with absent or invalid preferences", async () => {
		expect(await loadUsageMode()).toBe("left");
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "invalid" } });
		expect(await loadUsageMode()).toBe("left");
	});
	it.each(["left", "used"])("loads %s", async usageMode => {
		await writeAgentFile("settings.json", { "pi-usage": { usageMode } });
		expect(await loadUsageMode()).toBe(usageMode);
	});
});

describe("loadUsagePreferences", () => {
	it("defaults absent preferences to left and footer", async () => {
		expect(await loadUsagePreferences()).toEqual({ usageMode: "left", usagePlacement: "footer" });
	});
	it("loads below-editor placement with the shared mode", async () => {
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "used", usagePlacement: "belowEditor" } });
		expect(await loadUsagePreferences()).toEqual({ usageMode: "used", usagePlacement: "belowEditor" });
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
	it("preserves unrelated pi preferences", async () => {
		await writeAgentFile("settings.json", { theme: "dark", "pi-usage": { usageMode: "left" } });
		await saveUsageMode("used");
		expect(JSON.parse(await readFile(SETTINGS_FILE, "utf8"))).toEqual({ theme: "dark", "pi-usage": { usageMode: "used" } });
	});
	it("preserves the custom-footer placement when changing mode", async () => {
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "left", usagePlacement: "belowEditor" } });
		await saveUsageMode("used");
		expect(JSON.parse(await readFile(SETTINGS_FILE, "utf8"))).toEqual({ "pi-usage": { usageMode: "used", usagePlacement: "belowEditor" } });
	});
	it("rejects invalid or unwritable settings rather than overwriting them", async () => {
		await mkdir(SETTINGS_FILE, { recursive: true });
		await expect(saveUsageMode("left")).rejects.toThrow();
	});
});
