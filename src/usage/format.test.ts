import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { codexUsage, copilotUsage } from "../../testing/fixtures";
import { formatStatus, unavailableStatus } from "./format";

function createContext() {
	const fg = vi.fn((_color: string, text: string) => text);
	return { ctx: { ui: { theme: { fg } } } as unknown as ExtensionContext, fg };
}

describe("formatStatus", () => {
	it.each([[26, "success"], [25, "warning"], [11, "warning"], [10, "error"], [null, "muted"]] as const)("colors the icon and percentage by %s remaining in either mode", (leftPercent, color) => {
		const { ctx, fg } = createContext();
		for (const mode of ["left", "used"] as const) {
			fg.mockClear();
			const text = leftPercent === null ? "--" : `${mode === "left" ? leftPercent : 100 - leftPercent}%`;
			expect(formatStatus(ctx, { ...copilotUsage, windows: [{ label: "premium", leftPercent, resetInSeconds: null }] }, mode)).toBe(` ${text}`);
			expect(fg.mock.calls).toEqual([[color, ""], [color, text]]);
		}
	});
	it("uses the lowest known quota for the icon, ignoring unknown and unlimited values", () => {
		const { ctx, fg } = createContext();
		const windows = [
			{ label: "unlimited", leftPercent: 0, resetInSeconds: null, unlimited: true },
			{ label: "unknown", leftPercent: null, resetInSeconds: null },
			{ label: "5h", leftPercent: 81, resetInSeconds: null },
			{ label: "7d", leftPercent: 20, resetInSeconds: null },
		];
		expect(formatStatus(ctx, { ...codexUsage, windows }, "used")).toBe(" 󰛤 -- 19% 80%");
		expect(fg.mock.calls).toEqual([["warning", ""], ["success", "󰛤"], ["muted", "--"], ["success", "19%"], ["warning", "80%"]]);
	});
	it("keeps limited usage red while rounding percentages and omitting provider and window labels", () => {
		const { ctx, fg } = createContext();
		const usage = { ...codexUsage, label: "Codex Spark", isLimited: true, windows: [{ ...codexUsage.windows[0], leftPercent: 81.4 }, codexUsage.windows[1]] };
		expect(formatStatus(ctx, usage, "used")).toBe(" 19% (󰔛2h10m) 36% (󰔛6d22h)");
		expect(fg).toHaveBeenCalledWith("error", "");
	});
	it("shows unlimited premium in green without a fake percentage or countdown in either mode", () => {
		const { ctx, fg } = createContext();
		const usage = { ...copilotUsage, windows: [{ label: "premium", leftPercent: null, resetInSeconds: 86_400, unlimited: true }] };
		for (const mode of ["left", "used"] as const) {
			fg.mockClear();
			expect(formatStatus(ctx, usage, mode)).toBe(" 󰛤");
			expect(fg.mock.calls).toEqual([["success", ""], ["success", "󰛤"]]);
		}
	});
	it.each([[NaN, ""], [-10, " (󰔛0s)"], [30, " (󰔛30s)"], [120, " (󰔛2m)"]])("formats countdowns for %s seconds", (resetInSeconds, countdown) => {
		const { ctx } = createContext();
		expect(formatStatus(ctx, { ...codexUsage, windows: [{ label: "7d", leftPercent: 64, resetInSeconds }] }, "left")).toBe(` 64%${countdown}`);
	});
});

describe("unavailableStatus", () => {
	it("uses the usage icon and a warning color for retrieval failures", () => {
		const { ctx, fg } = createContext();
		expect(unavailableStatus(ctx)).toBe(" unavailable");
		expect(fg).toHaveBeenCalledWith("warning", " unavailable");
	});
});
