const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getSpaces } = require('../dist/nodes/Bdp/resources/space/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const run = (parameters, responses, items) => {
	const { context, calls } = createContext(parameters, responses, items);
	return new Bdp().execute.call(context).then(([output]) => ({ output, calls }));
};

test('Space List in building and on floor uses the matching route with filters and links', async () => {
	const space = { id: 's-1', name: 'Room', metadata: null, measurementCount: 0, active: true };
	const filters = {
		name: 'Room', referenceId: 'ref', metadata: 'k=v', ontologyType: 'Office',
		measurementCount: 2, commissionedStatus: 'Commissioned', orderBy: 'NameAscending',
	};
	const { output, calls } = await run(
		[
			{ resource: 'space', operation: 'getAll', spaceScope: 'building', buildingId: { mode: 'list', value: 'b/1' }, returnAll: true, ...filters },
			{ resource: 'space', operation: 'getAll', spaceScope: 'floor', floorId: { mode: 'id', value: 'f/1' }, limit: 1 },
		],
		[
			{ body: [space], headers: { 'x-total-count': '1' } },
			{ body: [{ id: 's-2' }], headers: { 'x-total-count': '2' } },
		],
		[{ json: {} }, { json: {} }],
	);
	assert.deepEqual(output, [
		{ json: space, pairedItem: { item: 0 } },
		{ json: { id: 's-2' }, pairedItem: { item: 1 } },
	]);
	assert.deepEqual(paths(calls), ['/api/Buildings/b%2F1/Spaces', '/api/Floors/f%2F1/Spaces']);
	assert.deepEqual(calls[0].qs, { ...filters, take: 5000, skip: 0 });
	assert.deepEqual(calls[1].qs, { take: 1, skip: 0 });
});

test('Space List defaults to building scope and Limit 100, and empty results return no items', async () => {
	const { output, calls } = await run(
		[{ resource: 'space', operation: 'getAll', buildingId: { mode: 'id', value: 'b-1' } }],
		[{ body: [], headers: {} }],
	);
	assert.deepEqual(output, []);
	assert.deepEqual(paths(calls), ['/api/Buildings/b-1/Spaces']);
	assert.equal(calls[0].qs.take, 100);
});

test('Space List omits empty filters, including an unset Commissioned Status', async () => {
	const { calls } = await run(
		[{ resource: 'space', operation: 'getAll', buildingId: { mode: 'id', value: 'b-1' }, commissionedStatus: '' }],
		[{ body: [], headers: {} }],
	);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Space Get uses selected or manual IDs without requiring a parent', async () => {
	for (const mode of ['list', 'id']) {
		const space = { id: 's/1', metadata: { a: null }, measurementCount: 3 };
		const { output, calls } = await run(
			[{ resource: 'space', operation: 'getById', spaceId: { mode, value: 's/1' } }],
			[{ body: space, headers: {} }],
		);
		assert.deepEqual(output, [{ json: space, pairedItem: { item: 0 } }]);
		assert.deepEqual(paths(calls), ['/api/Spaces/s%2F1']);
	}
});

test('Space operations reject missing inputs and invalid limits without requests', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getAll' }, /Building ID is required/],
		[{ operation: 'getAll', buildingId: { mode: 'id', value: ' ' } }, /Building ID is required/],
		[{ operation: 'getAll', spaceScope: 'floor' }, /Floor ID is required/],
		[{ operation: 'getAll', spaceScope: 'floor', buildingId: { mode: 'id', value: 'b-1' } }, /Floor ID is required/],
		[{ operation: 'getAll', spaceScope: 'other', buildingId: { mode: 'id', value: 'b-1' } }, /supported space scope/],
		[{ operation: 'getAll', buildingId: { mode: 'id', value: 'b-1' }, limit: 0 }, /positive whole number/],
		[{ operation: 'getById' }, /Space ID is required/],
		[{ operation: 'getById', spaceId: { mode: 'id', value: ' ' } }, /Space ID is required/],
		[{ operation: 'other' }, /not supported/],
	]) {
		const { context, calls } = createContext([{ resource: 'space', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Space operations reject malformed responses and propagate safe API errors', async () => {
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid space detail response/],
		['getById', null, /invalid space detail response/],
	]) {
		const { context } = createContext(
			[{ resource: 'space', operation, buildingId: { mode: 'id', value: 'b-1' }, spaceId: { mode: 'id', value: 's-1' } }],
			[{ body, headers: {} }],
		);
		await assert.rejects(new Bdp().execute.call(context), message);
	}
	for (const [operation, status, message] of [['getAll', 403, /denied access/], ['getById', 404, /HTTP 404/]]) {
		const { context } = createContext(
			[{ resource: 'space', operation, buildingId: { mode: 'id', value: 'b-1' }, spaceId: { mode: 'id', value: 's-1' } }],
			[errorWithStatus(status)],
		);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, message);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
	}
});

test('Space failures support continue-on-fail and preserve input linking', async () => {
	const { context } = createContext(
		[{ resource: 'space', operation: 'getById' }, { resource: 'space', operation: 'getById', spaceId: { mode: 'id', value: 's-2' } }],
		[{ body: { id: 's-2' }, headers: {} }],
		[{ json: {} }, { json: {} }],
		true,
	);
	const [output] = await new Bdp().execute.call(context);
	assert.match(output[0].json.error, /Space ID is required/);
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.deepEqual(output[1], { json: { id: 's-2' }, pairedItem: { item: 1 } });
});

test('Space locator searches the selected building or floor and refreshes per search', async () => {
	const parameters = { spaceScope: 'building', buildingId: { mode: 'list', value: 'b/1' }, floorId: { mode: 'id', value: 'f/1' } };
	const { context, calls } = createContext([parameters], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `s-${i}`, name: i ? null : 'Room' })), headers: {} },
		{ body: [{ id: 's-50' }], headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getSpaces.call(context, 'Room');
	assert.deepEqual(first.results[0], { name: 'Room (s-0)', value: 's-0' });
	assert.deepEqual(first.results[1], { name: 'Space s-1', value: 's-1' });
	assert.equal(first.paginationToken, '50');
	assert.equal((await getSpaces.call(context, 'Room', first.paginationToken)).paginationToken, undefined);
	parameters.spaceScope = 'floor';
	await getSpaces.call(context, 'New');
	assert.deepEqual(paths(calls), ['/api/Buildings/b%2F1/Spaces', '/api/Buildings/b%2F1/Spaces', '/api/Floors/f%2F1/Spaces']);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ take: 50, skip: 0, name: 'Room' },
		{ take: 50, skip: 50, name: 'Room' },
		{ take: 50, skip: 0, name: 'New' },
	]);
});

test('Space locator rejects missing parents, bad scope, invalid tokens, bad responses and API errors', async () => {
	for (const parameters of [
		{ spaceScope: 'building', buildingId: { mode: 'id', value: '' } },
		{ spaceScope: 'building', buildingId: { mode: 'id', value: '={{ $json.id }}' } },
		{ spaceScope: 'floor', floorId: { mode: 'id', value: ' ' } },
		{ spaceScope: 'floor', buildingId: { mode: 'id', value: 'b-1' } },
	]) {
		const { context, calls } = createContext([parameters], []);
		await assert.rejects(getSpaces.call(context), /resolved (building|floor) ID/);
		assert.equal(calls.length, 0);
	}
	const base = { spaceScope: 'building', buildingId: { mode: 'id', value: 'b-1' } };
	await assert.rejects(getSpaces.call(createContext([{ ...base, spaceScope: 'x' }], []).context), /supported space scope/);
	await assert.rejects(getSpaces.call(createContext([base], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getSpaces.call(createContext([base], [{ body: {}, headers: {} }]).context), /invalid space search response/);
	await assert.rejects(getSpaces.call(createContext([base], [errorWithStatus(403)]).context), /denied access/);
});

test('Space properties show only the relevant parent selector and a constrained status', () => {
	const props = new Bdp().description.properties;
	const shown = (name, parameters) =>
		props.some((p) => {
			if (p.name !== name) return false;
			const { resource, operation, spaceScope } = p.displayOptions?.show ?? {};
			return resource?.includes('space') && operation?.includes(parameters.operation) &&
				(!spaceScope || spaceScope.includes(parameters.spaceScope));
		});
	assert.ok(shown('buildingId', { operation: 'getAll', spaceScope: 'building' }));
	assert.ok(shown('buildingId', { operation: 'getAll', spaceScope: 'floor' })); // only to search floors
	assert.ok(shown('floorId', { operation: 'getAll', spaceScope: 'floor' }));
	assert.ok(!shown('floorId', { operation: 'getAll', spaceScope: 'building' }));
	const listFloor = props.find((p) => p.name === 'floorId' && p.displayOptions.show.operation.includes('getAll') && p.displayOptions.show.resource.includes('space'));
	assert.equal(listFloor.required, true);
	const status = props.find((p) => p.name === 'commissionedStatus');
	assert.equal(status.type, 'options');
	const locator = props.find((p) => p.name === 'spaceId');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'getSpaces');
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[1].type, 'string');
	assert.deepEqual(locator.typeOptions.loadOptionsDependsOn, ['spaceScope', 'buildingId.value', 'floorId.value']);
	assert.equal(typeof new Bdp().methods.listSearch.getSpaces, 'function');
});
