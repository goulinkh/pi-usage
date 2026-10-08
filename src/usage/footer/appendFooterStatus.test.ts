import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import createFooterHarness from "../../../testing/createFooterHarness";
import { customFooterLine } from "../../../testing/fixtures";
import appendFooterStatus from "./appendFooterStatus";

describe("appendFooterStatus", () => {
	it("delegates unchanged when its status is absent and ignores other statuses", () => {
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		const lines = [customFooterLine];
		host.ui.setFooter(() => ({ invalidate() {}, render: () => lines }));
		host.ui.setStatus("other-extension", "other status");
		expect(host.render(200)).toBe(lines);
		host.ui.setStatus("pi-usage", "");
		expect(host.render(200)).toBe(lines);
	});

	it("reads live status updates without duplicating text or replacing metadata", () => {
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		host.ui.setFooter(() => ({ invalidate() {}, render: () => [customFooterLine] }));
		host.ui.setStatus("pi-usage", " 86% left");
		expect(host.render(200)).toEqual([`${customFooterLine} ·  86% left`]);
		host.ui.setStatus("pi-usage", " 14% used");
		expect(host.render(200)).toEqual([`${customFooterLine} ·  14% used`]);
		host.ui.setStatus("pi-usage", undefined);
		expect(host.render(200)).toEqual([customFooterLine]);
	});

	it.each([0, 1, 2, 5, 20, 80, 151])("fits ANSI colors and wide glyphs within %s terminal columns", width => {
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		host.ui.setFooter(() => ({ invalidate() {}, render: columns => [truncateToWidth("模型 · project", columns, "")] }));
		host.ui.setStatus("pi-usage", "\x1b[32m 95% left (󰔛23d13h)\x1b[0m");
		const lines = host.render(width)!;
		expect(lines).toHaveLength(1);
		expect(visibleWidth(lines[0])).toBeLessThanOrEqual(width);
		if (width >= 80) expect(lines[0]).toBe("模型 · project · \x1b[32m 95% left (󰔛23d13h)\x1b[0m");
	});

	it("keeps usage visible even if the custom footer ignores its reduced width", () => {
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		host.ui.setFooter(() => ({ invalidate() {}, render: () => [customFooterLine] }));
		host.ui.setStatus("pi-usage", " 86% left");
		const lines = host.render(50)!;
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(" ·  86% left");
		expect(visibleWidth(lines[0])).toBeLessThanOrEqual(50);
	});

	it("preserves other footer rows without modifying the component's cached array", () => {
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		const lines = ["first row", customFooterLine];
		host.ui.setFooter(() => ({ invalidate() {}, render: () => lines }));
		host.ui.setStatus("pi-usage", " 95% left");
		expect(host.render(200)).toEqual(["first row", `${customFooterLine} ·  95% left`]);
		expect(lines).toEqual(["first row", customFooterLine]);
	});

	it("renders only status when the custom footer has no rows", () => {
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		host.ui.setFooter(() => ({ invalidate() {}, render: () => [] }));
		host.ui.setStatus("pi-usage", " 95% left");
		expect(host.render(200)).toEqual([" 95% left"]);
	});

	it("preserves component method receivers, private fields, getters, focus, and disposal", () => {
		class Footer {
			#count = 0;
			get count() { return this.#count; }
			focused = false;
			handleInput() { this.#count++; }
			invalidate() { this.#count += 10; }
			dispose() { this.#count += 100; }
			render() { return [`count ${this.#count}`]; }
		}
		const host = createFooterHarness();
		appendFooterStatus(host.ui, "pi-usage");
		const original = new Footer();
		host.ui.setFooter(() => original);
		const footer = host.getFooter() as Footer;
		footer.handleInput();
		footer.invalidate();
		footer.focused = true;
		expect(original.focused).toBe(true);
		expect(footer.count).toBe(11);
		host.ui.setStatus("pi-usage", " 86% left");
		expect(host.render(200)).toEqual(["count 11 ·  86% left"]);
		host.ui.setFooter(undefined);
		expect(host.getFooter()).toBeUndefined();
		expect(original.count).toBe(111);
	});

	it("restores the original callback idempotently without replacing the existing footer", () => {
		const host = createFooterHarness();
		const restore = appendFooterStatus(host.ui, "pi-usage");
		host.ui.setFooter(() => ({ invalidate() {}, render: () => [customFooterLine] }));
		restore();
		restore();
		expect(host.ui.setFooter).toBe(host.setFooter);
		host.ui.setStatus("pi-usage", " 86% left");
		expect(host.render(200)).toEqual([customFooterLine]);
	});

	it("does not undo a newer extension's callback replacement", () => {
		const host = createFooterHarness();
		const restore = appendFooterStatus(host.ui, "pi-usage");
		const newer = () => {};
		host.ui.setFooter = newer;
		restore();
		expect(host.ui.setFooter).toBe(newer);
	});
});
