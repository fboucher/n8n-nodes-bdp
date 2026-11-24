const assert = require('node:assert/strict');
const test = require('node:test');
const {
	buildReplacePatch,
	normalizeWriteResponse,
	patchValue,
	requireUuid,
	safeWriteFailureMessage,
} = require('../dist/nodes/Bdp/shared/write.js');
const { requestBdpWrite } = require('../dist/nodes/Bdp/shared/transport.js');
const { createContext, errorWithStatus } = require('./helpers.cjs');

const allowlist = [
	{
		resource: 'widget',
		operation: 'update',
		method: 'PATCH',
		path: /^\/api\/Widgets\/[^/]+$/,
		idempotent: true,
	},
	{
		resource: 'widget',
		operation: 'create',
		method: 'POST',
		path: /^\/api\/Widgets$/,
		idempotent: false,
	},
];

const allowed = { '/value': patchValue.finiteNumber('Value'), '/name': patchValue.nonEmptyString('Name') };

test('JSON Patch builder emits only replace operations on allowed paths', () => {
	assert.deepEqual(buildReplacePatch([{ path: '/value', value: 4.5 }], allowed), [
		{ op: 'replace', path: '/value', value: 4.5 },
	]);
	assert.deepEqual(
		buildReplacePatch(
			[
				{ path: '/value', value: 0 },
				{ op: 'replace', path: '/name', value: 'x' },
			],
			allowed,
		).map(({ path }) => path),
		['/value', '/name'],
	);
});

test('JSON Patch builder rejects bad operations, paths, values and empty documents', () => {
	for (const [changes, message] of [
		[[], /at least one field/],
		[[{ op: 'add', path: '/value', value: 1 }], /only the JSON Patch "replace"/i],
		[[{ op: 'remove', path: '/value', value: 1 }], /only the JSON Patch "replace"/i],
		[[{ path: '/other', value: 1 }], /not supported/],
		[[{ path: '/__proto__', value: 1 }], /not supported/],
		[[{ path: '/toString', value: 1 }], /not supported/],
		[[{ path: '/value', value: undefined }], /value is required/],
		[[{ path: '/value', value: '1' }], /finite number/],
		[[{ path: '/value', value: NaN }], /finite number/],
		[[{ path: '/value', value: Infinity }], /finite number/],
		[[{ path: '/value', value: null }], /finite number/],
		[[{ path: '/name', value: '  ' }], /non-empty/],
		[
			[
				{ path: '/value', value: 1 },
				{ path: '/value', value: 2 },
			],
			/only be replaced once/,
		],
	]) {
		assert.throws(() => buildReplacePatch(changes, allowed), message);
	}
});

test('value validators check types', () => {
	assert.equal(patchValue.integer('N')(3), 3);
	assert.throws(() => patchValue.integer('N')(3.5), /whole number/);
	assert.deepEqual(patchValue.stringArray('L')(['a']), ['a']);
	assert.throws(() => patchValue.stringArray('L')(['a', 1]), /list of non-empty text/);
	assert.throws(() => patchValue.stringArray('L')('a'), /list of non-empty text/);
	assert.throws(() => patchValue.plainObject('O')([]), /JSON object/);
	assert.equal(requireUuid(' 3f2504e0-4f89-41d3-9a0c-0305e82c3301 ', 'ID'), '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
	assert.throws(() => requireUuid('nope', 'ID'), /valid UUID/);
	assert.throws(() => requireUuid(5, 'ID'), /valid UUID/);
});

test('204, 200 and 206 responses normalize to distinct outcomes', () => {
	assert.deepEqual(normalizeWriteResponse(204, undefined), { outcome: 'noContent', statusCode: 204 });
	assert.deepEqual(normalizeWriteResponse(200, ''), { outcome: 'noContent', statusCode: 200 });
	assert.deepEqual(normalizeWriteResponse(undefined, undefined), { outcome: 'noContent', statusCode: 204 });
	assert.deepEqual(normalizeWriteResponse(200, { id: 'a' }), {
		outcome: 'success',
		statusCode: 200,
		data: { id: 'a' },
	});
	const body = [
		{ identity: { id: 'a' }, statusCode: 200, value: '1', timeStamp: '2025-01-01T00:00:00Z', metadata: {} },
		{
			identity: { id: 'b', path: '/p' },
			statusCode: 404,
			metadata: { ErrorCode: 'NotFound', ErrorText: 'No such point: submitted-secret' },
		},
		{ identity: { id: 'c' }, metadata: { ErrorText: 'Boom: submitted-secret' } },
	];
	const result = normalizeWriteResponse(206, body);
	assert.equal(result.outcome, 'partial');
	assert.equal(result.statusCode, 206);
	assert.equal(result.items.length, 3);
	assert.deepEqual(result.itemErrors, [
		{
			id: 'b',
			path: '/p',
			statusCode: 404,
			ok: false,
			errorCode: 'NotFound',
			error: 'BDP rejected the item (HTTP 404).',
		},
		{ id: 'c', ok: false, error: 'BDP rejected the item.' },
	]);
	assert.equal(result.items[0].ok, true);
	assert.doesNotMatch(JSON.stringify(result.itemErrors), /submitted-secret|No such point|Boom/);
});

test('206 with an unrecognised body reports partial success without item errors', () => {
	for (const body of [undefined, 'text', { detail: 'x' }]) {
		const result = normalizeWriteResponse(206, body);
		assert.equal(result.outcome, 'partial');
		assert.deepEqual(result.items, []);
		assert.deepEqual(result.itemErrors, []);
	}
});

test('write failure messages are status-derived and never include bodies or credentials', () => {
	for (const status of [undefined, 400, 401, 403, 404, 413, 415, 424, 429, 500, 504]) {
		const message = safeWriteFailureMessage(status);
		assert.doesNotMatch(message, /private|secret|token|Bearer/i);
	}
	assert.match(safeWriteFailureMessage(504), /outcome is unknown/);
});

function write(context, request) {
	return requestBdpWrite.call(context, request, allowlist);
}

test('requestBdpWrite sends PATCH with json-patch content type, auth, version header and no retry flag', async () => {
	const { context, calls } = createContext([{}], [{ body: undefined, statusCode: 204, headers: {} }]);
	const result = await write(context, {
		resource: 'widget',
		operation: 'update',
		method: 'PATCH',
		path: '/api/Widgets/w%2F1',
		body: [{ op: 'replace', path: '/value', value: 1 }],
		jsonPatch: true,
	});
	assert.deepEqual(result, { outcome: 'noContent', statusCode: 204 });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'PATCH');
	assert.equal(calls[0].url, 'https://ecostruxure-building-platform-api-uat.se.app/api/Widgets/w%2F1');
	assert.equal(calls[0].headers['Content-Type'], 'application/json-patch+json');
	assert.equal(calls[0].headers['X-Api-Version'], '3.0');
	assert.deepEqual(calls[0].body, [{ op: 'replace', path: '/value', value: 1 }]);
	assert.equal(calls[0].returnFullResponse, true);
});

test('requestBdpWrite sends POST with a plain JSON content type and returns the body', async () => {
	const { context, calls } = createContext([{}], [{ body: { id: 'n' }, statusCode: 200, headers: {} }]);
	const result = await write(context, {
		resource: 'widget',
		operation: 'create',
		method: 'POST',
		path: '/api/Widgets',
		body: { name: 'x' },
	});
	assert.deepEqual(result, { outcome: 'success', statusCode: 200, data: { id: 'n' } });
	assert.equal(calls[0].headers['Content-Type'], 'application/json');
});

test('requestBdpWrite rejects non-/api paths and unlisted operations before credentials or network', async () => {
	let credentialLookups = 0;
	const { context, calls } = createContext([{}], []);
	context.getCredentials = async () => {
		credentialLookups++;
		return { environment: 'uat' };
	};
	const base = { resource: 'widget', operation: 'update', method: 'PATCH', path: '/api/Widgets/1', body: [] };
	for (const [request, message] of [
		[{ ...base, path: '/graphql' }, /documented BDP API/],
		[{ ...base, path: '//evil.example/api/x' }, /documented BDP API/],
		[{ ...base, resource: 'building' }, /not permitted/],
		[{ ...base, operation: 'delete' }, /not permitted/],
		[{ ...base, method: 'DELETE' }, /not permitted/],
		[{ ...base, method: 'POST' }, /not permitted/],
		[{ ...base, path: '/api/Widgets/1/extra' }, /not permitted/],
		[{ ...base, path: '/api/Other/1' }, /not permitted/],
	]) {
		await assert.rejects(write(context, request), message);
	}
	await assert.rejects(requestBdpWrite.call(context, base), /not permitted/);
	assert.equal(credentialLookups, 0);
	assert.equal(calls.length, 0);
});

test('writes are not retried by default, even for idempotent operations and transient errors', async () => {
	for (const status of [429, 500, 502, 503, 504]) {
		const { context, calls } = createContext(
			[{}],
			[errorWithStatus(status, { 'retry-after': '0' }), { body: undefined, statusCode: 204, headers: {} }],
		);
		await assert.rejects(
			write(context, {
				resource: 'widget',
				operation: 'update',
				method: 'PATCH',
				path: '/api/Widgets/1',
				body: [],
			}),
			new RegExp(`HTTP ${status}`),
		);
		assert.equal(calls.length, 1);
	}
	const { context, calls } = createContext([{}], [Object.assign(new Error('x'), { code: 'ECONNRESET' })]);
	await assert.rejects(
		write(context, { resource: 'widget', operation: 'create', method: 'POST', path: '/api/Widgets', body: {} }),
		/failed before a response was received/,
	);
	assert.equal(calls.length, 1);
});

test('retry is opt-in and only honoured for idempotent allowlist entries', async () => {
	const fastRetry = () => errorWithStatus(503, { 'retry-after': '0' });
	let { context, calls } = createContext(
		[{}],
		[fastRetry(), { body: undefined, statusCode: 204, headers: {} }],
	);
	const result = await write(context, {
		resource: 'widget',
		operation: 'update',
		method: 'PATCH',
		path: '/api/Widgets/1',
		body: [],
		retry: true,
	});
	assert.equal(result.outcome, 'noContent');
	assert.equal(calls.length, 2);

	// A POST create is never retried, even if the caller asks.
	({ context, calls } = createContext([{}], [fastRetry(), { body: { id: 'x' }, statusCode: 200, headers: {} }]));
	await assert.rejects(
		write(context, {
			resource: 'widget',
			operation: 'create',
			method: 'POST',
			path: '/api/Widgets',
			body: {},
			retry: true,
		}),
		/HTTP 503/,
	);
	assert.equal(calls.length, 1);
});

test('write errors never echo credentials, tokens, or request bodies', async () => {
	const secretBody = { password: 'hunter2-secret', token: 'tok-123' };
	for (const status of [400, 401, 403, 404, 413, 424, 429, 504, undefined]) {
		const { context } = createContext([{}], [status === undefined ? new Error('tok-123 hunter2-secret') : errorWithStatus(status)]);
		context.getCredentials = async () => ({ environment: 'uat', clientSecret: 'hunter2-secret', accessToken: 'tok-123' });
		await assert.rejects(
			write(context, { resource: 'widget', operation: 'create', method: 'POST', path: '/api/Widgets', body: secretBody }),
			(error) => {
				assert.doesNotMatch(error.message, /hunter2|tok-123|private response body/);
				return true;
			},
		);
	}
});

test('206 responses reach the caller as partial success', async () => {
	const body = [{ identity: { id: 'b' }, statusCode: 400, metadata: { ErrorText: 'Not writeable' } }];
	const { context } = createContext([{}], [{ body, statusCode: 206, headers: {} }]);
	const result = await write(context, {
		resource: 'widget',
		operation: 'update',
		method: 'PATCH',
		path: '/api/Widgets/1',
		body: [],
	});
	assert.equal(result.outcome, 'partial');
	assert.equal(result.itemErrors[0].error, 'BDP rejected the item (HTTP 400).');
});
