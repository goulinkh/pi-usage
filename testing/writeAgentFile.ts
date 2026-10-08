import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Write synthetic agent state into the directory isolated by the test setup.
 * @note Performs filesystem I/O; never writes outside the temporary test agent directory.
 */
export default async function writeAgentFile(name: string, value: unknown): Promise<void> {
	const agentDir = process.env.PI_CODING_AGENT_DIR!;
	await mkdir(agentDir, { recursive: true });
	await writeFile(path.join(agentDir, name), JSON.stringify(value), "utf8");
}
