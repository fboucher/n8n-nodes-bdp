const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getDataSets } = require('../dist/nodes/Bdp/resources/dataSet/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

test('Data Set List returns native records with filters across pages and per-item links', async () => {
	const dataSet = { id: 'ds-1', name: 'Energy', type: 'Reporting', metadata: null, active: true };
	const filters = { name: 'Energy', orderBy: 'NameAscending' };
	const { context, calls } = createContext(
		[
			{ resource: 'dataSet', operation: 'getAll', returnAll: true, ...filters },
			{ resource: 'dataSet', operation: 'getAll', limit: 1 },
		],
		[
			{ body: [dataSet], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'ds-2' }], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'ds-3' }], headers: { 'x-total-count': '3' } },
		],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [
		{ json: dataSet, pairedItem: { item: 0 } },
		{ json: { id: 'ds-2' }, pairedItem: { item: 0 } },
		{ json: { id: 'ds-3' }, pairedItem: { item: 1 } },
	]);
	assert.deepEqual(paths(calls), ['/api/DataSets', '/api/DataSets', '/api/DataSets']);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ ...filters, take: 5000, skip: 0 },
		{ ...filters, take: 5000, skip: 1 },
		{ take: 1, skip: 0 },
	]);
});

test('Data Set List defaults to Limit 100, omits empty filters and returns no items when empty', async () => {
	const { context, calls } = createContext([{ resource: 'dataSet', operation: 'getAll', name: '' }], [{ body: [], headers: {} }]);
	assert.deepEqual(await new Bdp().execute.call(context), [[]]);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Data Set Get uses selected or manual IDs', async () => {
	for (const mode of ['list', 'id']) {
		const dataSet = { id: 'ds/1', type: 'Reporting', metadata: { a: null } };
		const { context, calls } = createContext(
			[{ resource: 'dataSet', operation: 'getById', dataSetId: { mode, value: 'ds/1' } }],
			[{ body: dataSet, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: dataSet, pairedItem: { item: 0 } }]]);
		assert.deepEqual(paths(calls), ['/api/DataSets/ds%2F1']);
	}
});

test('Data Set operations only send GET requests and expose no write operation', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'dataSet', operation: 'getAll' },
			{ resource: 'dataSet', operation: 'getById', dataSetId: { mode: 'id', value: 'ds-1' } },
		],
		[{ body: [], headers: {} }, { body: { id: 'ds-1' }, headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	await new Bdp().execute.call(context);
	assert.equal(calls.length, 2);
	for (const call of calls) assert.equal(call.method, 'GET');
	assert.ok(calls.every(({ method }) => !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)));
	assert.ok(calls.every(({ url }) => !/OnDemand/i.test(url)));

	const operationProperty = new Bdp().description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('dataSet'),
	);
	assert.deepEqual(operationProperty.options.map(({ value }) => value), ['getAll', 'getById']);

	for (const operation of ['create', 'update', 'patch', 'post', 'delete']) {
		const { context: c, calls: rejected } = createContext([{ resource: 'dataSet', operation }], []);
		await assert.rejects(new Bdp().execute.call(c), /not supported/);
		assert.equal(rejected.length, 0);
	}
});

test('Data Set operations reject missing IDs, invalid limits, malformed responses and safe API errors', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getById' }, /Data Set ID is required/],
		[{ operation: 'getById', dataSetId: { mode: 'id', value: ' ' } }, /Data Set ID is required/],
		[{ operation: 'getAll', limit: 0 }, /positive whole number/],
	]) {
		const { context, calls } = createContext([{ resource: 'dataSet', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid data set detail response/],
		['getById', null, /invalid data set detail response/],
	]) {
		const { context } = createContext(
			[{ resource: 'dataSet', operation, dataSetId: { mode: 'id', value: 'ds-1' } }],
			[{ body, headers: {} }],
		);
		await assert.rejects(new Bdp().execute.call(context), message);
	}
	for (const [operation, status, message] of [['getAll', 403, /denied access/], ['getById', 404, /HTTP 404/]]) {
		const { context } = createContext(
			[{ resource: 'dataSet', operation, dataSetId: { mode: 'id', value: 'ds-1' } }],
			[errorWithStatus(status)],
		);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, message);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
	}
});

test('Data Set locator is searchable, pages by name and handles bad responses and errors', async () => {
	const locator = new Bdp().description.properties.find((p) => p.name === 'dataSetId');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'getDataSets');
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[1].type, 'string');
	assert.equal(typeof new Bdp().methods.listSearch.getDataSets, 'function');

	const { context, calls } = createContext([{}], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `ds-${i}`, name: i ? null : 'Energy' })), headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getDataSets.call(context, 'Ener');
	assert.deepEqual(first.results[0], { name: 'Energy (ds-0)', value: 'ds-0' });
	assert.deepEqual(first.results[1], { name: 'Data Set ds-1', value: 'ds-1' });
	assert.equal(first.paginationToken, '50');
	assert.deepEqual(await getDataSets.call(context, 'Ener', first.paginationToken), { results: [], paginationToken: undefined });
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ take: 50, skip: 0, name: 'Ener' },
		{ take: 50, skip: 50, name: 'Ener' },
	]);
	assert.deepEqual(paths(calls), ['/api/DataSets', '/api/DataSets']);
	await assert.rejects(getDataSets.call(createContext([{}], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getDataSets.call(createContext([{}], [{ body: {}, headers: {} }]).context), /invalid data set search response/);
	await assert.rejects(getDataSets.call(createContext([{}], [errorWithStatus(403)]).context), /denied access/);
});
