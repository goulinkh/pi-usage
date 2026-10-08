import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	appendFooterStatus, DEFAULT_USAGE_MODE, DEFAULT_USAGE_PLACEMENT, errorMessage, formatStatus, getUsage, getUsageLabel,
	loadUsagePreferences, MissingAuthError, parseUsageMode, saveUsageMode, SETTINGS_FILE,
	unavailableStatus, usageModeCompletions,
	type PercentMode, type UsageModel, type UsagePlacement, type UsageSnapshot,
} from "#usage";

const EXTENSION_ID = "pi-usage";
const REFRESH_INTERVAL_MS = 60_000;

class UsageStatus {
	private ctx?: ExtensionContext;
	private generation = 0;
	private timer?: ReturnType<typeof setInterval>;
	private inFlight = false;
	private queued?: { ctx: ExtensionContext; generation: number; revision: number; model?: UsageModel };
	private model?: UsageModel;
	private modelRevision = 0;
	private lastUsage?: UsageSnapshot;
	private usageMode: PercentMode = DEFAULT_USAGE_MODE;
	private usagePlacement: UsagePlacement = DEFAULT_USAGE_PLACEMENT;
	private usageModeRevision = 0;
	private settingsQueue: Promise<void> = Promise.resolve();
	private restoreFooter?: () => void;

	public constructor(private readonly pi: ExtensionAPI) {
		pi.on("session_start", (_event, ctx) => this.start(ctx));
		pi.on("turn_end", (_event, ctx) => void this.refresh(ctx));
		pi.on("model_select", (event, ctx) => this.selectModel(ctx, event.model));
		pi.on("session_shutdown", (_event, ctx) => this.stop(ctx));

		this.registerUsageModeCommand();
	}

	private isCurrent(generation: number): boolean {
		return this.ctx !== undefined && this.generation === generation;
	}

	private async start(ctx: ExtensionContext): Promise<void> {
		this.restoreFooter?.();
		this.restoreFooter = undefined;
		this.generation++;
		this.ctx = ctx;
		this.model = ctx.model;
		this.modelRevision++;
		this.lastUsage = undefined;
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
		this.timer.unref?.();

		const generation = this.generation;
		await this.loadPreferences(ctx, generation);
		if (!this.isCurrent(generation)) return;
		if (ctx.hasUI && ctx.mode === "tui" && this.usagePlacement === "inlineFooter") {
			this.restoreFooter = appendFooterStatus(ctx.ui, EXTENSION_ID);
		}
		void this.refresh(ctx, this.model, generation);
	}

	private selectModel(ctx: ExtensionContext, model: UsageModel): void {
		this.model = model;
		this.modelRevision++;
		this.lastUsage = undefined;
		if (ctx.hasUI) this.setUsageStatus(ctx, undefined);
		void this.refresh(ctx, model);
	}

	private stop(ctx: ExtensionContext): void {
		this.restoreFooter?.();
		this.restoreFooter = undefined;
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		this.queued = undefined;
		this.lastUsage = undefined;
		this.ctx = undefined;
		this.generation++;
		if (ctx.hasUI) this.setUsageStatus(ctx, undefined);
	}

	/** Update only this extension's status or widget; never replace another extension's footer.
	 * @note Mutates pi UI state. Terminal widgets fall back to status text in RPC mode.
	 */
	private setUsageStatus(ctx: ExtensionContext, text: string | undefined): void {
		const displayAsWidget = this.usagePlacement === "belowEditor" && ctx.mode === "tui";
		ctx.ui.setStatus(EXTENSION_ID, displayAsWidget ? undefined : text);
		if (ctx.mode === "tui") {
			ctx.ui.setWidget(EXTENSION_ID, displayAsWidget && text ? [text] : undefined, { placement: "belowEditor" });
		}
	}

	private enqueueSettingsOperation<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.settingsQueue.then(operation);
		this.settingsQueue = result.then(() => undefined, () => undefined);
		return result;
	}

	private async loadPreferences(ctx: ExtensionContext, generation: number): Promise<void> {
		const revision = this.usageModeRevision;
		try {
			const preferences = await this.enqueueSettingsOperation(() => loadUsagePreferences());
			if (this.isCurrent(generation)) {
				this.usagePlacement = preferences.usagePlacement;
				if (this.usageModeRevision === revision) this.usageMode = preferences.usageMode;
			}
		} catch (error) {
			if (!this.isCurrent(generation)) return;
			this.usagePlacement = DEFAULT_USAGE_PLACEMENT;
			const changedDuringLoad = this.usageModeRevision !== revision;
			if (!changedDuringLoad) this.usageMode = DEFAULT_USAGE_MODE;
			if (ctx.hasUI) {
				const action = changedDuringLoad ? "keeping current mode" : "using default";
				ctx.ui.notify(`pi-usage: failed to load ${SETTINGS_FILE}, ${action}: ${errorMessage(error)}`, "warning");
			}
		}
	}

	private async refresh(ctx = this.ctx, model = this.model, generation = this.generation, revision = this.modelRevision): Promise<void> {
		if (!ctx?.hasUI || !this.isCurrent(generation)) return;
		const label = getUsageLabel(model);
		if (!label) {
			this.lastUsage = undefined;
			this.setUsageStatus(ctx, undefined);
			return;
		}
		if (this.inFlight) {
			this.queued = { ctx, generation, revision, model };
			return;
		}

		this.inFlight = true;
		try {
			const usage = await getUsage(model);
			if (!this.isCurrent(generation) || revision !== this.modelRevision) return;
			this.lastUsage = usage ?? undefined;
			this.setUsageStatus(ctx, usage ? formatStatus(ctx, usage, this.usageMode) : undefined);
		} catch (error) {
			if (!this.isCurrent(generation) || revision !== this.modelRevision) return;
			this.lastUsage = undefined;
			this.setUsageStatus(ctx, error instanceof MissingAuthError ? undefined : unavailableStatus(ctx, label));
		} finally {
			this.inFlight = false;
			const queued = this.queued;
			this.queued = undefined;
			if (queued && this.isCurrent(queued.generation) && queued.revision === this.modelRevision) {
				void this.refresh(queued.ctx, queued.model, queued.generation, queued.revision);
			}
		}
	}

	private renderLast(ctx: ExtensionContext): boolean {
		if (!ctx.hasUI || !this.lastUsage) return false;
		this.setUsageStatus(ctx, formatStatus(ctx, this.lastUsage, this.usageMode));
		return true;
	}

	private saveUsageMode(ctx: ExtensionContext, generation = this.generation): void {
		const usageMode = this.usageMode;
		const result = this.enqueueSettingsOperation(() => saveUsageMode(usageMode));
		void result.catch(error => {
			const notifyContext = this.ctx ?? ctx;
			if (this.isCurrent(generation) && notifyContext.hasUI) {
				notifyContext.ui.notify(`pi-usage: failed to write ${SETTINGS_FILE}: ${errorMessage(error)}`, "warning");
			}
		});
	}

	private registerUsageModeCommand(): void {
		this.pi.registerCommand("usage-mode", {
			description: "Toggle usage display mode, or set it explicitly: left | used",
			getArgumentCompletions: usageModeCompletions,
			handler: async (args, ctx) => {
				const usageMode = parseUsageMode(args, this.usageMode);
				if (!usageMode) return;

				this.usageModeRevision++;
				this.usageMode = usageMode;
				this.saveUsageMode(ctx);
				if (!this.renderLast(ctx)) await this.refresh(ctx);
			},
		});
	}
}

/** Register provider-aware usage status and the shared display-mode command.
 * @note Registers lifecycle handlers and starts session-scoped polling through session_start.
 */
export default function (pi: ExtensionAPI) {
	new UsageStatus(pi);
}
