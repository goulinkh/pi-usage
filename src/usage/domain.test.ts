import { describe, expect, it } from "vitest";
import { asObject, errorMessage } from "./domain";

describe("asObject", () => {
	it("accepts objects and rejects other JSON values", () => {
		const value = { x: 1 };
		expect(asObject(value)).toBe(value);
		for (const input of [null, undefined, [], "value", 1, false]) expect(asObject(input)).toBeUndefined();
	});
});

describe("errorMessage", () => {
	it("formats both Error instances and thrown primitives", () => {
		expect(errorMessage(new Error("failure"))).toBe("failure");
		expect(errorMessage("failure")).toBe("failure");
	});
});
