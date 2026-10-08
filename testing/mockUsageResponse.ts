import { vi } from "vitest";

/** Replace the external usage request with a fresh synthetic JSON response on every call.
 * @note Stubs global fetch, preventing any request from reaching an external account.
 */
export default function mockUsageResponse(data: unknown, status = 200) {
	const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(data), { status }));
	vi.stubGlobal("fetch", fetch);
	return fetch;
}
