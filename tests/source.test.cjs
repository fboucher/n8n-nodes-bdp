const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getSources } = require('../dist/nodes/Bdp/resources/source/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

test('Source List returns native records with filters across pages and per-item links', async () => {
	const source = { id: 'src-1', name: 'Gateway', type: 'Modbus', metadata: null, active: true };
	const filters = { type: 'Modbus', name: 'Gateway', orderBy: 'NameAscending' };
	const { context, calls } = createContext(
		[
			{ resource: 'source', operation: 'getAll', returnAll: true, ...filters },
			{ resource: 'source', operation: 'getAll', limit: 1 },
		],
		[
			{ body: [source], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'src-2' }], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'src-3' }], headers: { 'x-total-count': '3' } },
		],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [
		{ json: source, pairedItem: { item: 0 } },
		{ json: { id: 'src-2' }, pairedItem: { item: 0 } },
		{ json: { id: 'src-3' }, pairedItem: { item: 1 } },
	]);
	assert.deepEqual(paths(calls), ['/api/Sources', '/api/Sources', '/api/Sources']);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ ...filters, take: 5000, skip: 0 },
		{ ...filters, take: 5000, skip: 1 },
		{ take: 1, skip: 0 },
	]);
});

test('Source List defaults to Limit 100, omits empty filters and returns no items when empty', async () => {
	const { context, calls } = createContext([{ resource: 'source', operation: 'getAll', type: '' }], [{ body: [], headers: {} }]);
	assert.deepEqual(await new Bdp().execute.call(context), [[]]);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Source Get uses selected or manual IDs', async () => {
	for (const mode of ['list', 'id']) {
		const source = { id: 'src/1', type: 'Bacnet', metadata: { a: null } };
		const { context, calls } = createContext(
			[{ resource: 'source', operation: 'getById', sourceId: { mode, value: 'src/1' } }],
			[{ body: source, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: source, pairedItem: { item: 0 } }]]);
		assert.deepEqual(paths(calls), ['/api/Sources/src%2F1']);
	}
});

test('Source operations only send GET requests and expose no on-demand operation', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'source', operation: 'getAll' },
			{ resource: 'source', operation: 'getById', sourceId: { mode: 'id', value: 'src-1' } },
		],
		[{ body: [], headers: {} }, { body: { id: 'src-1' }, headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	await new Bdp().execute.call(context);
	assert.equal(calls.length, 2);
	for (const call of calls) assert.equal(call.method, 'GET');
	assert.ok(calls.every(({ url }) => !/OnDemand/i.test(url)));

	const operationProperty = new Bdp().description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('source'),
	);
	assert.deepEqual(operationProperty.options.map(({ value }) => value), ['getAll', 'getById']);

	for (const operation of ['onDemand', 'post', 'delete']) {
		const { context: c, calls: rejected } = createContext([{ resource: 'source', operation }], []);
		await assert.rejects(new Bdp().execute.call(c), /not supported/);
		assert.equal(rejected.length, 0);
	}
});

test('Source operations reject missing IDs, invalid limits, malformed responses and safe API errors', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getById' }, /Source ID is required/],
		[{ operation: 'getById', sourceId: { mode: 'id', value: ' ' } }, /Source ID is required/],
		[{ operation: 'getAll', limit: 0 }, /positive whole number/],
	]) {
		const { context, calls } = createContext([{ resource: 'source', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid source detail response/],
		['getById', null, /invalid source detail response/],
	]) {
		const { context } = createContext(
			[{ resource: 'source', operation, sourceId: { mode: 'id', value: 'src-1' } }],
			[{ body, headers: {} }],
		);
		await assert.rejects(new Bdp().execute.call(context), message);
	}
	for (const [operation, status, message] of [['getAll', 403, /denied access/], ['getById', 404, /HTTP 404/]]) {
		const { context } = createContext(
			[{ resource: 'source', operation, sourceId: { mode: 'id', value: 'src-1' } }],
			[errorWithStatus(status)],
		);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, message);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
	}
});

test('Source locator is searchable, pages by name and handles bad responses and errors', async () => {
	const locator = new Bdp().description.properties.find((p) => p.name === 'sourceId');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'getSources');
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[1].type, 'string');
	assert.equal(typeof new Bdp().methods.listSearch.getSources, 'function');

	const { context, calls } = createContext([{}], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `src-${i}`, name: i ? null : 'Gateway' })), headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getSources.call(context, 'Gate');
	assert.deepEqual(first.results[0], { name: 'Gateway (src-0)', value: 'src-0' });
	assert.deepEqual(first.results[1], { name: 'Source src-1', value: 'src-1' });
	assert.equal(first.paginationToken, '50');
	assert.deepEqual(await getSources.call(context, 'Gate', first.paginationToken), { results: [], paginationToken: undefined });
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ take: 50, skip: 0, name: 'Gate' },
		{ take: 50, skip: 50, name: 'Gate' },
	]);
	assert.deepEqual(paths(calls), ['/api/Sources', '/api/Sources']);
	await assert.rejects(getSources.call(createContext([{}], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getSources.call(createContext([{}], [{ body: {}, headers: {} }]).context), /invalid source search response/);
	await assert.rejects(getSources.call(createContext([{}], [errorWithStatus(403)]).context), /denied access/);
});
