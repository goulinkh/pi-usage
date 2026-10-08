import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import createDeferred from "../../../testing/createDeferred";
import createExtensionHarness from "../../../testing/createExtensionHarness";
import { auth, codexResponse, copilotResponse, customFooterLine } from "../../../testing/fixtures";
import mockUsageResponse from "../../../testing/mockUsageResponse";
import writeAgentFile from "../../../testing/writeAgentFile";
import { loadUsageMode, SETTINGS_FILE } from "../../usage/preferences";

let harness: ReturnType<typeof createExtensionHarness> | undefined;
afterEach(async () => harness?.emit("session_shutdown"));

async function startCopilot() {
	await writeAgentFile("auth.json", auth);
	mockUsageResponse(copilotResponse);
	harness = createExtensionHarness({ provider: "github-copilot", id: "claude-sonnet-4.6" });
	await harness.emit("session_start");
	await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 80% left"));
	return harness;
}

describe("provider-aware usage footer", () => {
	it("appends usage to the custom footer's existing line without adding a widget row", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2029-12-31T00:00:00Z"));
		await writeAgentFile("settings.json", { "pi-usage": { usagePlacement: "inlineFooter" } });
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.3-codex" });
		await harness.emit("session_start");
		harness.installFooter(() => ({ invalidate() {}, render: width => [truncateToWidth(customFooterLine, width, "")] }));
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 80% left"));
		expect(harness.renderFooter(200)).toEqual([`${customFooterLine} ·  80% left (󰔛1d0h)`]);
		expect(harness.setWidget).toHaveBeenLastCalledWith("pi-usage", undefined, { placement: "belowEditor" });
		await harness.command("used");
		expect(harness.renderFooter(200)).toEqual([`${customFooterLine} ·  20% used (󰔛1d0h)`]);
		for (const width of [0, 1, 20, 80, 151]) {
			const lines = harness.renderFooter(width)!;
			expect(lines).toHaveLength(1);
			expect(visibleWidth(lines[0])).toBeLessThanOrEqual(width);
		}
		await harness.emit("model_select", { model: { provider: "anthropic", id: "claude" } });
		expect(harness.renderFooter(200)).toEqual([customFooterLine]);
		await harness.emit("session_shutdown");
		expect(harness.ctx.ui.setFooter).toBe(harness.setFooter);
	});

	it("does not stack inline adapters across session starts", async () => {
		await writeAgentFile("settings.json", { "pi-usage": { usagePlacement: "inlineFooter" } });
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.3-codex" });
		for (let session = 0; session < 2; session++) {
			await harness.emit("session_start");
			harness.installFooter(() => ({ invalidate() {}, render: () => [customFooterLine] }));
			await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 80% left"));
			expect(harness.renderFooter(200)![0].match(//g)).toHaveLength(1);
		}
	});

	it("keeps a mode selected during a successful preferences load while applying inline placement", async () => {
		await writeAgentFile("auth.json", auth);
		const settings = { "pi-usage": { usageMode: "left", usagePlacement: "inlineFooter" } };
		await writeAgentFile("settings.json", settings);
		const pending = createDeferred<string>();
		const readFile = fs.readFile.bind(fs);
		let settingsReads = 0;
		vi.spyOn(fs, "readFile").mockImplementation((...args) => {
			if (args[0] === SETTINGS_FILE && ++settingsReads === 1) return pending.promise;
			return readFile(...args);
		});
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.3-codex" });
		const start = harness.emit("session_start");
		await vi.waitFor(() => expect(settingsReads).toBe(1));
		await harness.command("used");
		pending.resolve(JSON.stringify(settings));
		await start;
		harness.installFooter(() => ({ invalidate() {}, render: () => [customFooterLine] }));
		await vi.waitFor(() => expect(harness!.renderFooter(200)![0]).toContain(" 20% used"));
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
	});

	it("can display premium below the editor without replacing a custom footer", async () => {
		await writeAgentFile("settings.json", { "pi-usage": { usagePlacement: "belowEditor" } });
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.3-codex" });
		await harness.emit("session_start");
		await vi.waitFor(() => expect(harness!.setWidget).toHaveBeenCalledWith("pi-usage", [expect.stringMatching(/^ 80% left/)], { placement: "belowEditor" }));
		expect(harness.getStatus()).toBeUndefined();
		expect(harness.ctx.ui.setFooter).toBe(harness.setFooter);
		await harness.command("used");
		expect(harness.setWidget).toHaveBeenLastCalledWith("pi-usage", [expect.stringMatching(/^ 20% used/)], { placement: "belowEditor" });
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
		await harness.emit("model_select", { model: { provider: "anthropic", id: "claude" } });
		expect(harness.setWidget).toHaveBeenLastCalledWith("pi-usage", undefined, { placement: "belowEditor" });
		await harness.emit("session_shutdown");
		expect(harness.setWidget).toHaveBeenLastCalledWith("pi-usage", undefined, { placement: "belowEditor" });
	});

	it.each(["belowEditor", "inlineFooter"])("falls back from %s to statuses in RPC", async usagePlacement => {
		await writeAgentFile("settings.json", { "pi-usage": { usagePlacement } });
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.3-codex" });
		Object.assign(harness.ctx, { mode: "rpc" });
		await harness.emit("session_start");
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 80% left"));
		expect(harness.setWidget).not.toHaveBeenCalled();
		expect(harness.ctx.ui.setFooter).toBe(harness.setFooter);
	});

	it("renders Codex on startup and reuses cached usage when changing mode", async () => {
		await writeAgentFile("auth.json", auth);
		const fetch = mockUsageResponse(codexResponse);
		harness = createExtensionHarness();
		await harness.emit("session_start");
		await vi.waitFor(() => expect(harness!.getStatus()).toBe(" 5h:81% left (󰔛2h10m) 7d:64% left (󰔛6d22h)"));
		expect(harness.ctx.ui.setFooter).toBe(harness.setFooter);
		await harness.command("used");
		expect(harness.getStatus()).toContain(" 5h:19% used");
		expect(fetch).toHaveBeenCalledTimes(1);
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
		await harness.command("");
		expect(harness.getStatus()).toContain("81% left");
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("left"));
		const count = harness.setStatus.mock.calls.length;
		await harness.command("invalid");
		expect(harness.setStatus).toHaveBeenCalledTimes(count);
	});

	it("renders only Copilot premium and honors the saved shared display preference", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2029-12-31T00:00:00Z"));
		await writeAgentFile("settings.json", { "pi-usage": { usageMode: "used" } });
		await writeAgentFile("auth.json", auth);
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.4" });
		await harness.emit("session_start");
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 20% used"));
		expect(harness.getStatus()).toBe(" 20% used (󰔛1d0h)");
	});

	it("routes model_select by event provider even when ctx.model is still the old model", async () => {
		harness = await startCopilot();
		const fetch = mockUsageResponse(codexResponse);
		await harness.emit("model_select", { model: { provider: "openai-codex", id: "gpt-5.3-codex" } });
		expect(harness.getStatus()).toBeUndefined();
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 5h:81% left"));
		await harness.command("used");
		expect(harness.getStatus()).toContain(" 5h:19% used");
		expect(fetch).toHaveBeenCalledTimes(1);
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
	});

	it("clears unsupported providers and never resurrects another provider's cached usage", async () => {
		harness = await startCopilot();
		const fetch = mockUsageResponse(codexResponse);
		await harness.emit("model_select", { model: { provider: "anthropic", id: "claude-sonnet-4.6" } });
		await harness.command("used");
		await harness.emit("turn_end");
		expect(harness.getStatus()).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
	});

	it("hides supported providers with missing OAuth credentials", async () => {
		const fetch = mockUsageResponse({});
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.4" });
		await harness.emit("session_start");
		await vi.waitFor(() => expect(harness!.setStatus).toHaveBeenCalledWith("pi-usage", undefined));
		expect(fetch).not.toHaveBeenCalled();
	});

	it("uses the failing provider label and drops stale cached snapshots", async () => {
		harness = await startCopilot();
		const fetch = mockUsageResponse({}, 503);
		await harness.emit("turn_end");
		await vi.waitFor(() => expect(harness!.getStatus()).toBe(" unavailable"));
		await harness.command("used");
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		expect(harness.getStatus()).not.toContain("80% left");
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
	});

	it.each(["resolve", "reject"] as const)("ignores stale in-flight Codex %s after switching to Copilot", async outcome => {
		await writeAgentFile("auth.json", auth);
		const pending = createDeferred<Response>();
		const fetch = vi.fn().mockImplementationOnce(() => pending.promise).mockImplementation(async () => new Response(JSON.stringify(copilotResponse)));
		vi.stubGlobal("fetch", fetch);
		harness = createExtensionHarness();
		await harness.emit("session_start");
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		await harness.emit("model_select", { model: { provider: "github-copilot", id: "gpt-5.4" } });
		await harness.command("used");
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
		if (outcome === "resolve") pending.resolve(new Response(JSON.stringify(codexResponse)));
		else pending.reject(new Error("stale request failed"));
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 20% used"));
		expect(harness.updates.some(text => text?.startsWith(""))).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("does not run an obsolete queued provider after switching to an unsupported model", async () => {
		await writeAgentFile("auth.json", auth);
		const pending = createDeferred<Response>();
		const fetch = vi.fn().mockImplementation(() => pending.promise);
		vi.stubGlobal("fetch", fetch);
		harness = createExtensionHarness();
		await harness.emit("session_start");
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		await harness.emit("model_select", { model: { provider: "github-copilot", id: "gpt-5.4" } });
		await harness.emit("model_select", { model: { provider: "anthropic", id: "claude" } });
		pending.resolve(new Response(JSON.stringify(codexResponse)));
		await new Promise(resolve => setTimeout(resolve, 30));
		expect(harness.getStatus()).toBeUndefined();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("suppresses stale results and errors after shutdown", async () => {
		await writeAgentFile("auth.json", auth);
		const pending = createDeferred<Response>();
		vi.stubGlobal("fetch", vi.fn().mockImplementation(() => pending.promise));
		harness = createExtensionHarness();
		await harness.emit("session_start");
		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		await harness.emit("session_shutdown");
		pending.reject(new Error("session ended"));
		await new Promise(resolve => setTimeout(resolve, 30));
		expect(harness.updates).toEqual([undefined]);
	});

	it("starts a new session while an old session request is in flight", async () => {
		await writeAgentFile("auth.json", auth);
		const pending = createDeferred<Response>();
		const fetch = vi.fn().mockImplementationOnce(() => pending.promise).mockImplementation(async () => new Response(JSON.stringify(codexResponse)));
		vi.stubGlobal("fetch", fetch);
		harness = createExtensionHarness();
		await harness.emit("session_start");
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		await harness.emit("session_start");
		pending.resolve(new Response(JSON.stringify(copilotResponse)));
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 5h:81% left"));
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("refreshes once per minute and stops polling on shutdown", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		harness = await startCopilot();
		const fetch = mockUsageResponse(copilotResponse);
		await vi.advanceTimersByTimeAsync(60_000);
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		await harness.emit("session_shutdown");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("makes no requests or UI calls in non-UI sessions, including mode commands", async () => {
		const fetch = mockUsageResponse({});
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.4" }, false);
		await harness.emit("session_start");
		await harness.command("used");
		await harness.emit("turn_end");
		await harness.emit("model_select", { model: { provider: "openai-codex", id: "gpt-5.4" } });
		await vi.waitFor(async () => expect(await loadUsageMode()).toBe("used"));
		expect(fetch).not.toHaveBeenCalled();
		expect(harness.setStatus).not.toHaveBeenCalled();
	});

	it("warns and keeps the default mode when stored settings cannot be read", async () => {
		await writeAgentFile("auth.json", auth);
		await writeAgentFile("settings.json", {});
		await fs.writeFile(SETTINGS_FILE, "invalid json");
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.4" });
		await harness.emit("session_start");
		await vi.waitFor(() => expect(harness!.getStatus()).toContain("80% left"));
		expect(harness.notify).toHaveBeenCalledWith(expect.stringContaining("using default"), "warning");
		await harness.command("used");
		await vi.waitFor(() => expect(harness!.notify).toHaveBeenCalledWith(expect.stringContaining("failed to write"), "warning"));
	});

	it("does not notify when a settings load fails in a non-UI session", async () => {
		await writeAgentFile("settings.json", {});
		await fs.writeFile(SETTINGS_FILE, "invalid json");
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.4" }, false);
		await harness.emit("session_start");
		await new Promise(resolve => setTimeout(resolve, 30));
		expect(harness.notify).not.toHaveBeenCalled();
	});

	it("does not apply a previous session's successful preferences load to the new session", async () => {
		await writeAgentFile("auth.json", auth);
		const firstLoad = createDeferred<string>();
		const secondLoad = createDeferred<string>();
		const readFile = fs.readFile.bind(fs);
		let settingsReads = 0;
		vi.spyOn(fs, "readFile").mockImplementation((...args) => {
			if (args[0] !== SETTINGS_FILE) return readFile(...args);
			settingsReads++;
			return settingsReads === 1 ? firstLoad.promise : secondLoad.promise;
		});
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.3-codex" });
		const firstStart = harness.emit("session_start");
		await vi.waitFor(() => expect(settingsReads).toBe(1));
		const secondStart = harness.emit("session_start");
		firstLoad.resolve(JSON.stringify({ "pi-usage": { usageMode: "used", usagePlacement: "belowEditor" } }));
		await firstStart;
		await vi.waitFor(() => expect(settingsReads).toBe(2));
		await harness.emit("model_select", { model: { provider: "github-copilot", id: "gpt-5.3-codex" } });
		await vi.waitFor(() => expect(harness!.getStatus()).toContain(" 80% left"));
		expect(harness.setWidget).toHaveBeenLastCalledWith("pi-usage", undefined, { placement: "belowEditor" });
		secondLoad.resolve(JSON.stringify({ "pi-usage": { usageMode: "left", usagePlacement: "footer" } }));
		await secondStart;
		expect(harness.getStatus()).toContain(" 80% left");
	});

	it("ignores a settings-load failure that finishes after shutdown", async () => {
		const pending = createDeferred<string>();
		vi.spyOn(fs, "readFile").mockImplementation(() => pending.promise);
		harness = createExtensionHarness();
		const start = harness.emit("session_start");
		await vi.waitFor(() => expect(fs.readFile).toHaveBeenCalled());
		await harness.emit("session_shutdown");
		pending.reject("late settings failure");
		await start;
		expect(harness.notify).not.toHaveBeenCalled();
		expect(harness.updates).toEqual([undefined]);
	});

	it("does not notify about failed preference writes after shutdown", async () => {
		harness = await startCopilot();
		const pending = createDeferred<string>();
		vi.spyOn(fs, "readFile").mockImplementation(() => pending.promise);
		await harness.command("used");
		await vi.waitFor(() => expect(fs.readFile).toHaveBeenCalled());
		await harness.emit("session_shutdown");
		pending.reject("late write failure");
		await new Promise(resolve => setTimeout(resolve, 30));
		expect(harness.notify).not.toHaveBeenCalled();
	});

	it("keeps a mode selected while an initial settings load fails", async () => {
		await writeAgentFile("auth.json", auth);
		const pending = createDeferred<string>();
		const readFile = fs.readFile.bind(fs);
		vi.spyOn(fs, "readFile").mockImplementation((...args) => args[0] === SETTINGS_FILE ? pending.promise : readFile(...args));
		mockUsageResponse(copilotResponse);
		harness = createExtensionHarness({ provider: "github-copilot", id: "gpt-5.4" });
		const start = harness.emit("session_start");
		await harness.command("used");
		pending.reject("settings unavailable");
		await start;
		await vi.waitFor(() => expect(harness!.getStatus()).toContain("20% used"));
		await vi.waitFor(() => expect(harness!.notify).toHaveBeenCalledWith(expect.stringContaining("keeping current mode"), "warning"));
		await vi.waitFor(() => expect(harness!.notify).toHaveBeenCalledWith(expect.stringContaining("failed to write"), "warning"));
	});
});
