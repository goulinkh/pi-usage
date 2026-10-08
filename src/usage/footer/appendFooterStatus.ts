import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Append one extension's live status to the last row of subsequently installed custom footers.
 * Reserve terminal columns for the status, preserving the footer's other rows and component methods.
 * @note Wraps the public setFooter callback; call before the custom footer registers. The returned
 * cleanup restores that callback only if another extension has not replaced it in the meantime.
 * @experimental This opt-in adapter relies on extension load order and a mutable UI callback.
 */
export default function appendFooterStatus(ui: Pick<ExtensionUIContext, "setFooter">, key: string): () => void {
	const setFooter = ui.setFooter;
	let active = true;
	const wrappedSetFooter: ExtensionUIContext["setFooter"] = factory => {
		setFooter(factory && ((tui, theme, footerData) => {
			const component = factory(tui, theme, footerData);
			return new Proxy(component, {
				get(target, property) {
					if (property === "render") return (width: number): string[] => {
						if (!active) return target.render(width);
						const status = footerData.getExtensionStatuses().get(key);
						if (!status) return target.render(width);
						const separator = theme.fg("dim", " · ");
						const bodyWidth = Math.max(0, width - visibleWidth(status) - visibleWidth(separator));
						const lines = target.render(bodyWidth);
						const lastLine = truncateToWidth(lines.at(-1) ?? "", bodyWidth, "");
						return [...lines.slice(0, -1), truncateToWidth((lastLine ? lastLine + separator : "") + status, width, "")];
					};
					const value = Reflect.get(target, property, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
			});
		}));
	};
	ui.setFooter = wrappedSetFooter;
	return () => {
		active = false;
		if (ui.setFooter === wrappedSetFooter) ui.setFooter = setFooter;
	};
}
