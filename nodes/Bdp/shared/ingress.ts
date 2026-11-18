// Checks on the Telemetry Ingress SAS token that need no network access.

/** Returns a problem description, or undefined when the token looks usable. Never includes the token. */
export function sasTokenProblem(token: unknown, now = Date.now()): string | undefined {
	if (typeof token !== 'string' || !token.startsWith('SharedAccessSignature ')) {
		return 'The SAS token in the BDP Telemetry Ingress credential must start with "SharedAccessSignature ".';
	}
	const expiry = token.match(/[\s&]se=(\d+)/)?.[1];
	if (expiry !== undefined && Number(expiry) * 1000 <= now) {
		return 'The SAS token in the BDP Telemetry Ingress credential has expired. Generate a new one.';
	}
	return undefined;
}
