import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import { sasTokenProblem } from '../../shared/ingress';

// The ingress endpoint only accepts telemetry, so testing the credential by calling it would
// create data. This checks what can be checked without sending anything.
export async function bdpIngressApiTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	const data = (credential.data ?? {}) as Record<string, unknown>;
	if (data.environment !== 'uat' && data.environment !== 'production') {
		return { status: 'Error', message: 'Choose UAT or Production.' };
	}
	if (typeof data.deviceId !== 'string' || !data.deviceId.trim()) {
		return { status: 'Error', message: 'Set the Device ID.' };
	}
	const problem = sasTokenProblem(data.sasToken);
	if (problem) return { status: 'Error', message: problem };
	return {
		status: 'OK',
		message:
			'The device ID and the SAS token format and expiry look valid. No message was sent, so the hub has not yet verified the token; the first Send reports an invalid token.',
	};
}
