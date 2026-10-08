import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, vi } from "vitest";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-usage-test-"));
process.env.PI_CODING_AGENT_DIR = agentDir;

beforeEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await rm(agentDir, { recursive: true, force: true });
});

afterEach(() => vi.useRealTimers());

afterAll(async () => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	await rm(agentDir, { recursive: true, force: true });
});
