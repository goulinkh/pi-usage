import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

/** Supply the custom-footer host boundary with live in-memory statuses.
 * @note Calls real component factories but does not start a terminal or read account files.
 */
export default function createFooterHarness() {
	type FooterFactory = NonNullable<Parameters<ExtensionUIContext["setFooter"]>[0]>;
	const statuses = new Map<string, string>();
	let footer: ReturnType<FooterFactory> | undefined;
	const setFooter = vi.fn((factory: FooterFactory | undefined) => {
		footer?.dispose?.();
		footer = factory?.({ requestRender: vi.fn() } as never,
			{ fg: (_color: string, text: string) => text } as never,
			{ getExtensionStatuses: () => statuses } as never);
	});
	const ui: Pick<ExtensionUIContext, "setFooter" | "setStatus"> = {
		setFooter,
		setStatus: (key: string, text: string | undefined) => {
			if (text === undefined) statuses.delete(key);
			else statuses.set(key, text);
		},
	};
	return { ui, setFooter, getFooter: () => footer, render: (width: number) => footer?.render(width) };
}
