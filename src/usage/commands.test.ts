import { describe, expect, it } from "vitest";
import { parseUsageMode, usageModeCompletions } from "./commands";

describe("parseUsageMode", () => {
	it.each(["", " ", "toggle", " TOGGLE "])("toggles the current value for %j", args => {
		expect(parseUsageMode(args, "left")).toBe("used");
		expect(parseUsageMode(args, "used")).toBe("left");
	});
	it.each(["left", " LEFT ", "left extra"])("accepts a normalized explicit left mode (%j)", args => {
		expect(parseUsageMode(args, "used")).toBe("left");
	});
	it("accepts used and rejects invalid modes", () => {
		expect(parseUsageMode("used", "left")).toBe("used");
		expect(parseUsageMode("bad", "left")).toBeNull();
	});
});

describe("usageModeCompletions", () => {
	it("offers modes and toggle for empty input", () => {
		expect(usageModeCompletions("")?.map(item => item.value)).toEqual(["left", "used", "toggle"]);
	});
	it("matches normalized prefixes and returns null for unknown ones", () => {
		expect(usageModeCompletions(" U ")).toEqual([{ value: "used", label: "used", description: "Set to used" }]);
		expect(usageModeCompletions("t")).toEqual([{ value: "toggle", label: "toggle", description: "Toggle current value" }]);
		expect(usageModeCompletions("nope")).toBeNull();
	});
});
