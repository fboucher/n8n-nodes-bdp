import type { ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class BdpOAuth2Api implements ICredentialType {
	name = 'bdpOAuth2Api';

	displayName = 'BDP Community OAuth2 API';

	icon: Icon = { light: 'file:../icons/bdp.svg', dark: 'file:../icons/bdp.svg' };

	extends = ['oAuth2Api'];

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
			description: 'BDP API environment. The OAuth token is issued by the configured tenant.',
		},
		{
			displayName: 'Tenant ID',
			name: 'tenantId',
			type: 'string',
			default: '',
			required: true,
			description: 'Microsoft Entra tenant ID used by the client-credentials grant.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default:
				"={{ 'https://login.microsoftonline.com/' + $self.tenantId + '/oauth2/v2.0/token' }}",
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: '',
			required: true,
			description: 'The application scope supplied by your BDP administrator.',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				"={{ $credentials.environment === 'production' ? 'https://ecostruxure-building-platform-api.se.app' : 'https://ecostruxure-building-platform-api-uat.se.app' }}",
			url: '/api/Buildings?take=1',
			method: 'GET',
			headers: {
				'X-Api-Version': '3.0',
				Accept: 'application/json',
			},
		},
	};
}
