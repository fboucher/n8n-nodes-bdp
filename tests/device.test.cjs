const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getDevices } = require('../dist/nodes/Bdp/resources/device/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const id = (value, mode = 'id') => ({ mode, value });
const scopes = [
	['building', { buildingId: id('b/1', 'list') }, '/api/Buildings/b%2F1/Devices'],
	['floor', { floorId: id('f/1') }, '/api/Floors/f%2F1/Devices'],
	['space', { spaceId: id('s/1', 'list') }, '/api/Spaces/s%2F1/Devices'],
	['source', { sourceId: id('src/1') }, '/api/Sources/src%2F1/Devices'],
];

test('Device List uses the route for every scope with native types and per-item links', async () => {
	const device = { id: 'd-1', name: 'Meter', metadata: null, active: true };
	const { context, calls } = createContext(
		scopes.map(([deviceScope, parent]) => ({ resource: 'device', operation: 'getAll', deviceScope, ...parent, limit: 1 })),
		scopes.map((_, i) => ({ body: [i ? { id: `d-${i + 1}` } : device], headers: { 'x-total-count': '9' } })),
		scopes.map(() => ({ json: {} })),
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [
		{ json: device, pairedItem: { item: 0 } },
		{ json: { id: 'd-2' }, pairedItem: { item: 1 } },
		{ json: { id: 'd-3' }, pairedItem: { item: 2 } },
		{ json: { id: 'd-4' }, pairedItem: { item: 3 } },
	]);
	assert.deepEqual(paths(calls), scopes.map(([, , path]) => path));
});

test('Device List retains every filter across pages and defaults to building scope', async () => {
	const filters = {
		name: 'Meter', metadata: 'k=v', referenceId: 'ref', ontologyType: 'Meter', productType: 'PM5',
		vendorIdentifier: 'v-1', commissionedStatus: 'Decommissioned', orderBy: 'NameAscending',
	};
	const { context, calls } = createContext(
		[{ resource: 'device', operation: 'getAll', buildingId: id('b-1'), returnAll: true, ...filters }],
		[{ body: [{ id: 'd-1' }], headers: { 'x-total-count': '2' } }, { body: [{ id: 'd-2' }], headers: { 'x-total-count': '2' } }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.id), ['d-1', 'd-2']);
	assert.deepEqual(paths(calls), ['/api/Buildings/b-1/Devices', '/api/Buildings/b-1/Devices']);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ ...filters, take: 5000, skip: 0 },
		{ ...filters, take: 5000, skip: 1 },
	]);
});

test('Device List defaults to Limit 100, omits empty filters and returns no items when empty', async () => {
	const { context, calls } = createContext(
		[{ resource: 'device', operation: 'getAll', buildingId: id('b-1'), commissionedStatus: '' }],
		[{ body: [], headers: {} }],
	);
	assert.deepEqual(await new Bdp().execute.call(context), [[]]);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Device Get uses selected or manual IDs without requiring a parent', async () => {
	for (const mode of ['list', 'id']) {
		const device = { id: 'd/1', metadata: { a: null }, productType: 'PM5' };
		const { context, calls } = createContext(
			[{ resource: 'device', operation: 'getById', deviceId: id('d/1', mode) }],
			[{ body: device, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: device, pairedItem: { item: 0 } }]]);
		assert.deepEqual(paths(calls), ['/api/Devices/d%2F1']);
	}
});

test('Device operations reject missing inputs and invalid limits without requests', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getAll' }, /Building ID is required/],
		[{ operation: 'getAll', deviceScope: 'floor', buildingId: id('b-1') }, /Floor ID is required/],
		[{ operation: 'getAll', deviceScope: 'space', floorId: id('f-1') }, /Space ID is required/],
		[{ operation: 'getAll', deviceScope: 'source', spaceId: id('s-1') }, /Source ID is required/],
		[{ operation: 'getAll', deviceScope: 'source', sourceId: id(' ') }, /Source ID is required/],
		[{ operation: 'getAll', deviceScope: 'other' }, /supported device scope/],
		[{ operation: 'getAll', buildingId: id('b-1'), limit: 0 }, /positive whole number/],
		[{ operation: 'getById' }, /Device ID is required/],
		[{ operation: 'getById', deviceId: id(' ') }, /Device ID is required/],
		[{ operation: 'other' }, /not supported/],
	]) {
		const { context, calls } = createContext([{ resource: 'device', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Device operations reject malformed responses and propagate safe API errors', async () => {
	const parameters = (operation) => ({ resource: 'device', operation, buildingId: id('b-1'), deviceId: id('d-1') });
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid device detail response/],
		['getById', null, /invalid device detail response/],
	]) {
		const { context } = createContext([parameters(operation)], [{ body, headers: {} }]);
		await assert.rejects(new Bdp().execute.call(context), message);
	}
	for (const [operation, status, message] of [['getAll', 403, /denied access/], ['getById', 404, /HTTP 404/]]) {
		const { context } = createContext([parameters(operation)], [errorWithStatus(status)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, message);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
	}
});

test('Device failures support continue-on-fail and preserve input linking', async () => {
	const { context } = createContext(
		[{ resource: 'device', operation: 'getById' }, { resource: 'device', operation: 'getById', deviceId: id('d-2') }],
		[{ body: { id: 'd-2' }, headers: {} }],
		[{ json: {} }, { json: {} }],
		true,
	);
	const [output] = await new Bdp().execute.call(context);
	assert.match(output[0].json.error, /Device ID is required/);
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.deepEqual(output[1], { json: { id: 'd-2' }, pairedItem: { item: 1 } });
});

test('Device locator searches the selected parent for every scope and refreshes per search', async () => {
	const parameters = {
		deviceScope: 'building', buildingId: id('b/1', 'list'), floorId: id('f/1'), spaceId: id('s/1'), sourceId: id('src/1'),
	};
	const { context, calls } = createContext([parameters], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `d-${i}`, name: i ? null : 'Meter' })), headers: {} },
		{ body: [{ id: 'd-50' }], headers: {} },
		{ body: [], headers: {} },
		{ body: [], headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getDevices.call(context, 'Meter');
	assert.deepEqual(first.results[0], { name: 'Meter (d-0)', value: 'd-0' });
	assert.deepEqual(first.results[1], { name: 'Device d-1', value: 'd-1' });
	assert.equal(first.paginationToken, '50');
	assert.equal((await getDevices.call(context, 'Meter', first.paginationToken)).paginationToken, undefined);
	for (const scope of ['floor', 'space', 'source']) {
		parameters.deviceScope = scope;
		await getDevices.call(context, 'x');
	}
	assert.deepEqual(paths(calls), [
		'/api/Buildings/b%2F1/Devices', '/api/Buildings/b%2F1/Devices',
		'/api/Floors/f%2F1/Devices', '/api/Spaces/s%2F1/Devices', '/api/Sources/src%2F1/Devices',
	]);
	assert.deepEqual(calls[1].qs, { take: 50, skip: 50, name: 'Meter' });
});

test('Device locator rejects missing parents, bad scope, invalid tokens, bad responses and API errors', async () => {
	for (const [deviceScope, parent, pattern] of [
		['building', { buildingId: id('') }, /resolved building ID/],
		['floor', { floorId: id('={{ $json.id }}') }, /resolved floor ID/],
		['space', { buildingId: id('b-1') }, /resolved space ID/],
		['source', { sourceId: id(' ') }, /resolved source ID/],
	]) {
		const { context, calls } = createContext([{ deviceScope, ...parent }], []);
		await assert.rejects(getDevices.call(context), pattern);
		assert.equal(calls.length, 0);
	}
	const base = { deviceScope: 'source', sourceId: id('src-1') };
	await assert.rejects(getDevices.call(createContext([{ ...base, deviceScope: 'x' }], []).context), /supported device scope/);
	await assert.rejects(getDevices.call(createContext([base], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getDevices.call(createContext([base], [{ body: {}, headers: {} }]).context), /invalid device search response/);
	await assert.rejects(getDevices.call(createContext([base], [errorWithStatus(403)]).context), /denied access/);
});

test('Device properties show only the relevant parent selector and expose a reusable locator', () => {
	const props = new Bdp().description.properties;
	const shown = (name, operation, deviceScope, spaceScope) =>
		props.some((p) => {
			if (p.name !== name) return false;
			const show = p.displayOptions?.show ?? {};
			return show.resource?.includes('device') && show.operation?.includes(operation) &&
				(!show.deviceScope || show.deviceScope.includes(deviceScope)) &&
				(!show.spaceScope || show.spaceScope.includes(spaceScope));
		});
	for (const operation of ['getAll', 'getById']) {
		assert.ok(shown('buildingId', operation, 'building'));
		assert.ok(!shown('floorId', operation, 'building'));
		assert.ok(!shown('spaceId', operation, 'building'));
		assert.ok(!shown('sourceId', operation, 'building'));
		assert.ok(shown('floorId', operation, 'floor'));
		assert.ok(!shown('spaceId', operation, 'floor'));
		assert.ok(!shown('sourceId', operation, 'floor'));
		assert.ok(shown('spaceId', operation, 'space'));
		assert.ok(!shown('sourceId', operation, 'space'));
		assert.ok(shown('sourceId', operation, 'source'));
		assert.ok(!shown('buildingId', operation, 'source'));
		assert.ok(!shown('floorId', operation, 'source'));
		assert.ok(!shown('spaceId', operation, 'source'));
	}
	const required = (name, scope) =>
		props.find((p) => p.name === name && p.displayOptions.show.resource.includes('device') &&
			p.displayOptions.show.operation.includes('getAll') && p.displayOptions.show.deviceScope?.includes(scope)).required;
	assert.equal(required('floorId', 'floor'), true);
	assert.equal(required('spaceId', 'space'), true);
	assert.equal(required('sourceId', 'source'), true);
	const scopeProperty = props.find((p) => p.name === 'deviceScope' && p.displayOptions.show.operation.includes('getAll'));
	assert.deepEqual(scopeProperty.options.map(({ value }) => value), ['building', 'floor', 'space', 'source']);
	assert.equal(props.find((p) => p.name === 'commissionedStatus' && p.displayOptions.show.resource.includes('device')).type, 'options');
	const locator = props.find((p) => p.name === 'deviceId');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'getDevices');
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[1].type, 'string');
	assert.ok(locator.typeOptions.loadOptionsDependsOn.includes('deviceScope'));
	assert.equal(typeof new Bdp().methods.listSearch.getDevices, 'function');
});
