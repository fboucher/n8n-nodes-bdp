const assert = require('node:assert/strict');
const test = require('node:test');
const { BdpOAuth2Api } = require('../dist/credentials/BdpOAuth2Api.credentials.js');
const {
	fetchAllPages,
	requestBdp,
} = require('../dist/nodes/Bdp/shared/transport.js');

function requestContext(handler, environment = 'uat') {
	const calls = [];
	return {
		calls,
		context: {
			getNode: () => ({ name: 'Test BDP Node', type: 'n8n-nodes-bdp.bdp' }),
			getCredentials: async () => ({ environment }),
			helpers: {
				httpRequestWithAuthentication: async function (credentialType, options) {
					calls.push({ credentialType, options });
					return handler(options, calls.length);
				},
			},
		},
	};
}

test('credential uses n8n OAuth2 client credentials and tests read-only building access', () => {
	const credential = new BdpOAuth2Api();
	assert.deepEqual(credential.extends, ['oAuth2Api']);
	assert.equal(credential.properties.find((property) => property.name === 'grantType').default, 'clientCredentials');
	assert.equal(credential.test.request.method, 'GET');
	assert.match(credential.test.request.url, /Buildings\?take=1/);
	assert.equal(credential.test.request.headers['X-Api-Version'], '3.0');
});

test('requests use the selected fixed host and API version header', async () => {
	const { context, calls } = requestContext(async () => ({ body: [], headers: {} }));
	await requestBdp.call(context, '/api/Buildings', { take: 1 });
	assert.equal(calls[0].credentialType, 'bdpOAuth2Api');
	assert.equal(calls[0].options.method, 'GET');
	assert.equal(
		calls[0].options.url,
		'https://ecostruxure-building-platform-api-uat.se.app/api/Buildings',
	);
	assert.equal(calls[0].options.headers['X-Api-Version'], '3.0');
	assert.deepEqual(calls[0].options.qs, { take: 1 });
});

test('production credentials select only the production API host', async () => {
	const { context, calls } = requestContext(
		async () => ({ body: [], headers: {} }),
		'production',
	);
	await requestBdp.call(context, '/api/Buildings', {});
	assert.match(calls[0].options.url, /^https:\/\/ecostruxure-building-platform-api\.se\.app\//);
});

test('rejects non-API paths without making a request', async () => {
	const { context, calls } = requestContext(async () => ({ body: [], headers: {} }));
	await assert.rejects(requestBdp.call(context, 'https://example.com/', {}), /documented BDP/);
	assert.equal(calls.length, 0);
});

test('sanitizes access-denied errors and does not expose response details', async () => {
	const { context } = requestContext(async () => {
		const error = new Error('secret-bearing response');
		error.response = { statusCode: 403, body: 'private content' };
		throw error;
	});
	await assert.rejects(requestBdp.call(context, '/api/Buildings', {}), (error) => {
		assert.match(error.message, /denied access/);
		assert.doesNotMatch(error.message, /secret-bearing|private content/);
		return true;
	});
});

test('surfaces authentication failures without retrying or leaking response bodies', async () => {
	const { context, calls } = requestContext(async () => {
		const error = new Error('private response body');
		error.response = { statusCode: 401, body: 'private response body' };
		throw error;
	});
	await assert.rejects(requestBdp.call(context, '/api/Buildings', {}), (error) => {
		assert.match(error.message, /authentication failed/);
		assert.doesNotMatch(error.message, /private response body/);
		return true;
	});
	assert.equal(calls.length, 1);
});

test('retries a rate-limited request when Retry-After is usable', async () => {
	const { context, calls } = requestContext(async (_options, callNumber) => {
		if (callNumber === 1) {
			const error = new Error('rate limited');
			error.response = { statusCode: 429, headers: { 'retry-after': '0' } };
			throw error;
		}
		return { body: [], headers: {} };
	});
	await requestBdp.call(context, '/api/Buildings', {});
	assert.equal(calls.length, 2);
});

test('stops after the finite rate-limit retry budget', async () => {
	const { context, calls } = requestContext(async () => {
		const error = new Error('rate limited');
		error.response = { statusCode: 429, headers: { 'retry-after': '0' } };
		throw error;
	});
	await assert.rejects(requestBdp.call(context, '/api/Buildings', {}), /rate limit/);
	assert.equal(calls.length, 4);
});

test('paginates exact page-size multiples and preserves filters', async () => {
	const requests = [];
	const pages = [
		{ data: [{ id: 'a' }, { id: 'b' }], headers: {} },
		{ data: [{ id: 'c' }, { id: 'd' }], headers: {} },
		{ data: [], headers: {} },
	];
	const results = await fetchAllPages(
		async (_path, qs) => {
			requests.push(qs);
			return pages.shift();
		},
		'/api/Buildings',
		{ name: 'Lab' },
		{ returnAll: true, limit: 100, pageSize: 2 },
	);
	assert.deepEqual(results.map((record) => record.id), ['a', 'b', 'c', 'd']);
	assert.deepEqual(requests.map(({ take, skip, name }) => ({ take, skip, name })), [
		{ take: 2, skip: 0, name: 'Lab' },
		{ take: 2, skip: 2, name: 'Lab' },
		{ take: 2, skip: 4, name: 'Lab' },
	]);
});

test('uses response totals to continue after a short page', async () => {
	const requests = [];
	const results = await fetchAllPages(
		async (_path, qs) => {
			requests.push(qs);
			return requests.length === 1
				? { data: [{ id: 'a' }], headers: { 'x-total-count': '2' } }
				: { data: [{ id: 'b' }], headers: { 'x-total-count': '2' } };
		},
		'/api/Buildings',
		{},
		{ returnAll: true, limit: 100, pageSize: 10 },
	);
	assert.deepEqual(results.map((record) => record.id), ['a', 'b']);
	assert.deepEqual(requests.map(({ skip }) => skip), [0, 1]);
});

test('applies Limit across pages, including a partial final page', async () => {
	const requests = [];
	const results = await fetchAllPages(
		async (_path, qs) => {
			requests.push(qs);
			return requests.length === 1
				? { data: [{ id: 'a' }, { id: 'b' }], headers: {} }
				: { data: [{ id: 'c' }], headers: {} };
		},
		'/api/Buildings',
		{},
		{ returnAll: false, limit: 3, pageSize: 2 },
	);
	assert.deepEqual(results.map((record) => record.id), ['a', 'b', 'c']);
	assert.deepEqual(requests.map(({ take, skip }) => ({ take, skip })), [
		{ take: 2, skip: 0 },
		{ take: 1, skip: 2 },
	]);
});

test('fails rather than returning partial data when a later page fails', async () => {
	let page = 0;
	await assert.rejects(
		fetchAllPages(
			async () => {
				page++;
				if (page === 1) return { data: [{ id: 'a' }], headers: { link: '<next>; rel="next"' } };
				throw new Error('page failed');
			},
			'/api/Buildings',
			{},
			{ returnAll: true, limit: 100, pageSize: 1 },
		),
		/page failed/,
	);
});

test('stops safely when a continuation header does not advance', async () => {
	await assert.rejects(
		fetchAllPages(
			async () => ({ data: [], headers: { link: '<next>; rel="next"' } }),
			'/api/Buildings',
			{},
			{ returnAll: true, limit: 100, pageSize: 1 },
		),
		/pagination did not advance/,
	);
});

test('rejects repeated data pages even when the offset changes', async () => {
	await assert.rejects(
		fetchAllPages(
			async () => ({ data: [{ id: 'same-page' }], headers: {} }),
			'/api/Buildings',
			{},
			{ returnAll: true, limit: 100, pageSize: 1 },
		),
		/repeated a page without advancing/,
	);
});

test('rejects a repeated continuation link instead of following it', async () => {
	let requestCount = 0;
	await assert.rejects(
		fetchAllPages(
			async () => {
				requestCount++;
				return {
					data: [{ id: `page-${requestCount}` }],
					headers: { link: '<https://untrusted.example/page>; rel="next"' },
				};
			},
			'/api/Buildings',
			{},
			{ returnAll: true, limit: 100, pageSize: 1 },
		),
		/repeated a continuation link/,
	);
	assert.equal(requestCount, 2);
});

test('never requests more than the API maximum page size', async () => {
	let requestedTake;
	await fetchAllPages(
		async (_path, qs) => {
			requestedTake = qs.take;
			return { data: [], headers: {} };
		},
		'/api/Buildings',
		{},
		{ returnAll: true, limit: 100, pageSize: 5001 },
	);
	assert.equal(requestedTake, 5000);
});
