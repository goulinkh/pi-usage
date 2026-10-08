/** Missing OAuth fields for a supported provider; the footer should be hidden, not marked unavailable. */
export class MissingAuthError extends Error {
	constructor(provider: string) {
		super(`Missing ${provider} OAuth credentials`);
		this.name = "MissingAuthError";
	}
}
