import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import registerUsageStatus from "../extensions/usage-status";
import type { UsageModel } from "../src/usage/types";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;
type Command = { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };

/** Supply the host's event and UI boundaries while running the real extension and usage modules.
 * @note Registers the real extension's callbacks against an in-memory host, not a live pi session.
 */
export default function createExtensionHarness(model: UsageModel | undefined = { provider: "openai-codex", id: "gpt-5.3-codex" }, hasUI = true) {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, Command>();
	const updates: (string | undefined)[] = [];
	const notify = vi.fn();
	const setWidget = vi.fn();
	const setStatus = vi.fn((_key: string, text: string | undefined) => updates.push(text));
	const ctx = {
		hasUI, model, mode: hasUI ? "tui" : "print",
		ui: { theme: { fg: (_color: string, text: string) => text }, setStatus, setWidget, notify },
	} as unknown as ExtensionCommandContext;
	registerUsageStatus({
		on: (name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
		registerCommand: (name: string, command: Command) => commands.set(name, command),
	} as unknown as ExtensionAPI);
	return {
		ctx, notify, setStatus, setWidget, updates,
		getStatus: () => updates.at(-1),
		async emit(name: string, event: Record<string, unknown> = {}) {
			for (const handler of handlers.get(name) ?? []) await handler({ type: name, ...event }, ctx);
		},
		async command(args: string) {
			await commands.get("usage-mode")!.handler(args, ctx);
		},
	};
}
