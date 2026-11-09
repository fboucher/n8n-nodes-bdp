const assert = require('node:assert/strict');
const test = require('node:test');
const { NodeHelpers, Workflow } = require('n8n-workflow');
const { BdpOAuth2Api } = require('../dist/credentials/BdpOAuth2Api.credentials.js');

const tenantId = '00000000-0000-4000-8000-000000000001';
const expectedTokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const node = {
	name: 'BDP',
	type: 'bdp',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function resolveCredential(tenant, storedTokenUrl, forExecution = false) {
	const credential = new BdpOAuth2Api();
	const storedData = {
		tenantId: tenant,
		scope: 'synthetic/.default',
		environment: 'uat',
		...(storedTokenUrl === undefined ? {} : { accessTokenUrl: storedTokenUrl }),
	};
	// n8n discards stored OAuth pinned hidden fields before applying current defaults.
	for (const name of ['accessTokenUrl', 'grantType', 'authentication']) {
		delete storedData[name];
	}
	const data = NodeHelpers.getNodeParameters(
		credential.properties, storedData, true, false, null, null,
	);
	const workflow = new Workflow({
		nodes: [node],
		connections: {},
		active: false,
		nodeTypes: { getByNameAndVersion: () => ({ description: { properties: [] } }) },
	});

	if (forExecution) {
		return workflow.expression.getParameterValue(
			data, null, 0, 0, node.name, [], 'internal', {}, undefined, false, data,
		);
	}
	return workflow.expression.getComplexParameterValue(
		node, data, 'internal', {}, undefined, undefined, data,
	);
}

test('credential-test expressions resolve the tenant-specific OAuth token URL', () => {
	const resolved = resolveCredential(tenantId);
	assert.equal(resolved.accessTokenUrl, expectedTokenUrl);
	assert.equal(resolved.grantType, 'clientCredentials');
	assert.equal(resolved.authentication, 'body');
});

test('workflow credential expressions resolve the token URL without a $credentials binding', () => {
	assert.equal(resolveCredential(tenantId, undefined, true).accessTokenUrl, expectedTokenUrl);
});

test('existing credentials use the corrected hidden default without resaving', () => {
	const previousDefault = "={{ 'https://login.microsoftonline.com/' + $credentials.tenantId + '/oauth2/v2.0/token' }}";
	assert.equal(resolveCredential(tenantId, previousDefault).accessTokenUrl, expectedTokenUrl);
	assert.equal(resolveCredential(tenantId, '').accessTokenUrl, expectedTokenUrl);
});

test('token URL uses the configured tenant rather than a fixed tenant', () => {
	const alternateTenantId = '00000000-0000-4000-8000-000000000002';
	assert.equal(
		resolveCredential(alternateTenantId).accessTokenUrl,
		`https://login.microsoftonline.com/${alternateTenantId}/oauth2/v2.0/token`,
	);
});

test('credential-test request expressions retain their separate $credentials context', () => {
	const credential = new BdpOAuth2Api();
	const workflow = new Workflow({
		nodes: [node],
		connections: {},
		active: false,
		nodeTypes: { getByNameAndVersion: () => ({ description: { properties: [] } }) },
	});
	for (const environment of ['uat', 'production']) {
		const host = workflow.expression.getSimpleParameterValue(
			node, credential.test.request.baseURL, 'internal', { $credentials: { environment } },
		);
		assert.equal(
			host,
			environment === 'production'
				? 'https://ecostruxure-building-platform-api.se.app'
				: 'https://ecostruxure-building-platform-api-uat.se.app',
		);
	}
});
