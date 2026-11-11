// Docker-only integration harness for the pinned n8n runtime, not a package runtime dependency.
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const path = require('node:path');
const { requestBdpGraphql } = require('../dist/nodes/Bdp/shared/transport.js');

async function main() {
	const coreEntry = require.resolve('n8n-core', { paths: ['/usr/local/lib/node_modules/n8n'] });
	const runtimeRequire = createRequire(coreEntry);
	const { requestOAuth2, isTokenExpiryInFuture } = runtimeRequire(
		path.join(
			path.dirname(coreEntry),
			'execution-engine/node-execution-context/utils/request-helpers/oauth.js',
		),
	);
	const { Container } = runtimeRequire('@n8n/di');
	const { LockService } = runtimeRequire('@n8n/backend-common');
	Container.set(LockService, { withLease: async (_namespace, _key, fn) => fn() });
	let tokenRequests = 0;
	const server = http.createServer(async (req, res) => {
		let body = '';
		for await (const chunk of req) body += chunk;
		const form = new URLSearchParams(body);
		assert.equal(req.method, 'POST');
		assert.equal(form.get('grant_type'), 'client_credentials');
		assert.equal(form.get('client_id'), 'synthetic-client');
		assert.equal(form.get('client_secret'), 'synthetic-secret');
		assert.equal(form.get('scope'), 'synthetic/.default');
		tokenRequests++;
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				access_token: `synthetic-token-${tokenRequests}`,
				token_type: 'bearer',
				expires_in: 120,
			}),
		);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		const credentials = {
			environment: 'uat',
			grantType: 'clientCredentials',
			authentication: 'body',
			clientId: 'synthetic-client',
			clientSecret: 'synthetic-secret',
			scope: 'synthetic/.default',
			accessTokenUrl: `http://127.0.0.1:${server.address().port}/token`,
		};
		const node = {
			name: 'BDP',
			type: 'n8n-nodes-bdp.bdp',
			credentials: { bdpOAuth2Api: { id: 'synthetic-credential', name: 'Synthetic' } },
		};
		let saved = 0;
		let apiCalls = 0;
		let alwaysUnauthorized = false;
		let graphqlFailure = false;
		const additionalData = {
			credentialsHelper: {
				getDecrypted: async () => credentials,
				runPreAuthentication: async () => undefined,
				updateCredentialsOauthTokenData: async () => {
					saved++;
				},
			},
		};
		const context = {
			getNode: () => node,
			getCredentials: async () => credentials,
			getMode: () => 'internal',
			logger: { debug: () => {}, warn: () => {} },
			helpers: {
				httpRequestWithAuthentication: function (type, options) {
					return requestOAuth2.call(this, type, options, node, additionalData, undefined, true);
				},
				httpRequest: async (options) => {
					apiCalls++;
					assert.equal(options.method, 'POST');
					assert.equal(options.url, 'https://ecostruxure-building-platform-api-uat.se.app/graphql');
					assert.equal(options.rejectUnauthorized, true);
					assert.match(options.headers.Authorization, /^Bearer synthetic-token-\d+$/i);
					assert.deepEqual(options.body, { query: '{ buildings { id } }', variables: {} });
					if (alwaysUnauthorized || apiCalls === 1) {
						const error = new Error('expired');
						error.response = { status: 401 };
						throw error;
					}
					return {
						body: graphqlFailure
							? { errors: [{ message: `Denied ${credentials.oauthTokenData.access_token}` }] }
							: { data: { buildings: [] } },
						headers: {},
					};
				},
			},
		};
		const result = await requestBdpGraphql.call(context, '{ buildings { id } }', {});
		assert.deepEqual(result, { data: { buildings: [] } });
		assert.equal(
			tokenRequests,
			2,
			'Initial acquisition and one client-credentials reacquisition expected.',
		);
		assert.equal(saved, 2);
		assert.equal(apiCalls, 2);
		assert.equal(credentials.oauthTokenData.refresh_token, undefined);
		const expiry = Number(credentials.oauthTokenData.n8n_expires_at);
		assert.ok(expiry > Date.now() + 110_000 && expiry <= Date.now() + 120_000);
		assert.equal(isTokenExpiryInFuture(String(expiry)), true);
		assert.equal(isTokenExpiryInFuture(String(Date.now() - 1)), false);
		graphqlFailure = true;
		await assert.rejects(requestBdpGraphql.call(context, '{ buildings { id } }', {}), (error) => {
			assert.match(error.message, /Denied/);
			assert.doesNotMatch(error.message, /synthetic-token/);
			return true;
		});
		const previousApiCalls = apiCalls;
		alwaysUnauthorized = true;
		await assert.rejects(
			requestBdpGraphql.call(context, '{ buildings { id } }', {}),
			/authentication failed/,
		);
		assert.equal(apiCalls - previousApiCalls, 2, 'A second 401 must fail rather than loop.');
		assert.equal(tokenRequests, 3);
		console.log(
			'Pinned native n8n OAuth integration passed: client credentials, actual expires_in, persistence, one 401 reacquisition, secret redaction, bounded second-401 failure. Synthetic loopback token server only.',
		);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
