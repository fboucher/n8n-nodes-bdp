import type { IAuthenticateGeneric, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

// Credential for the Telemetry Ingress API (an Azure IoT Hub endpoint), which is separate from the
// BDP v3 API. The hub host is fixed per environment in the node, not entered here, so a credential
// can never point the node at an arbitrary host. There is no test request: the only endpoint
// accepts telemetry, and sending a test message would create data.
export class BdpIngressApi implements ICredentialType {
	name = 'bdpIngressApi';

	displayName = 'BDP Telemetry Ingress API';

	icon: Icon = { light: 'file:../icons/bdp.svg', dark: 'file:../icons/bdp.svg' };

	documentationUrl = 'https://github.com/fboucher/n8n-nodes-bdp#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'UAT', value: 'uat' },
				{ name: 'Production', value: 'production' },
			],
			default: 'uat',
			description: 'Which Telemetry Ingress hub to send to',
		},
		{
			displayName: 'Device ID',
			name: 'deviceId',
			type: 'string',
			default: '',
			required: true,
			description:
				'The device ID of your data source, exactly as shown in the BDP Portal. It is case-sensitive and must match the one inside the SAS token.',
		},
		{
			displayName: 'SAS Token',
			name: 'sasToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'The full token, starting with "SharedAccessSignature ". Tokens expire; paste a new one when this one does.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.sasToken}}',
			},
		},
	};
}
