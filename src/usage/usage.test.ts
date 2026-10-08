import { describe, expect, it } from "vitest";
import { auth, codexResponse, copilotResponse, sparkLimit } from "../../testing/fixtures";
import mockResponse from "../../testing/mockUsageResponse";
import writeAgentFile from "../../testing/writeAgentFile";
import { getUsage, getUsageLabel } from "./usage";

describe("getUsageLabel", () => {
	it("labels supported provider/model pairs and leaves unsupported models hidden", () => {
		expect(getUsageLabel({ provider: "openai-codex", id: "gpt-5.3-codex" })).toBe("Codex");
		expect(getUsageLabel({ provider: "openai-codex", id: "gpt-5.3-codex-spark" })).toBe("Codex Spark");
		expect(getUsageLabel({ provider: "github-copilot", id: "gpt-5.3-codex-spark" })).toBe("Copilot");
		expect(getUsageLabel({ provider: "unknown", id: "model" })).toBeUndefined();
		expect(getUsageLabel(undefined)).toBeUndefined();
	});
});

describe("getUsage", () => {
	it("fetches Codex windows for the selected Codex provider", async () => {
		await writeAgentFile("auth.json", auth);
		const fetch = mockResponse(codexResponse);
		expect(await getUsage({ provider: "openai-codex", id: "gpt-5.3-codex" })).toEqual({
			provider: "openai-codex", label: "Codex", isLimited: false,
			windows: [
				{ label: "5h", leftPercent: 81, resetInSeconds: 7_800 },
				{ label: "7d", leftPercent: 64, resetInSeconds: 597_600 },
			],
		});
		expect(fetch).toHaveBeenCalledWith("https://chatgpt.com/backend-api/wham/usage", expect.objectContaining({
			headers: expect.objectContaining({ authorization: "Bearer codex-test-token", "chatgpt-account-id": "codex-test-account" }),
		}));
	});

	it("selects Spark limits without treating a Copilot model with that ID as Codex", async () => {
		await writeAgentFile("auth.json", auth);
		mockResponse({ ...codexResponse, additional_rate_limits: [sparkLimit] });
		expect(await getUsage({ provider: "openai-codex", id: "gpt-5.3-codex-spark" })).toMatchObject({
			label: "Codex Spark", windows: [{ label: "7d", leftPercent: 58 }], isLimited: true,
		});
		const fetch = mockResponse(copilotResponse);
		expect(await getUsage({ provider: "github-copilot", id: "gpt-5.3-codex-spark" })).toMatchObject({ provider: "github-copilot", label: "Copilot" });
		expect(fetch.mock.calls[0][0]).toBe("https://api.github.com/copilot_internal/user");
	});

	it("fetches Copilot quotas using the GitHub refresh token, not the inference access token", async () => {
		await writeAgentFile("auth.json", { "github-copilot": auth["github-copilot"] });
		const fetch = mockResponse(copilotResponse);
		const usage = await getUsage({ provider: "github-copilot", id: "claude-sonnet-4.6" });
		expect(usage).toMatchObject({
			provider: "github-copilot", label: "Copilot", isLimited: false,
			windows: [
				{ label: "premium", leftPercent: 80, unlimited: false },
			],
		});
		expect(fetch).toHaveBeenCalledWith("https://api.github.com/copilot_internal/user", expect.objectContaining({
			headers: expect.objectContaining({ Authorization: "Bearer github-test-token" }),
		}));
	});

	it.each([undefined, { provider: "anthropic", id: "claude-sonnet-4.6" }, { provider: "toString", id: "x" }])("does not read credentials or request usage for unsupported models (%j)", async model => {
		const fetch = mockResponse({});
		expect(await getUsage(model)).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("never falls back to Codex credentials for Copilot", async () => {
		await writeAgentFile("auth.json", { "openai-codex": auth["openai-codex"] });
		const fetch = mockResponse({});
		await expect(getUsage({ provider: "github-copilot", id: "gpt-5.4" })).rejects.toThrow(/github-copilot/);
		expect(fetch).not.toHaveBeenCalled();
	});
});
