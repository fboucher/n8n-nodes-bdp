const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getDeviceGroups } = require('../dist/nodes/Bdp/resources/deviceGroup/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const id = (value, mode = 'id') => ({ mode, value });

test('Device Group List uses the building and source routes with native types and links', async () => {
	const group = { id: 'g-1', referenceId: 'r', metadata: null, active: true };
	const { context, calls } = createContext(
		[
			{ resource: 'deviceGroup', operation: 'getAll', deviceGroupScope: 'building', buildingId: id('b/1', 'list'), limit: 1 },
			{ resource: 'deviceGroup', operation: 'getAll', deviceGroupScope: 'source', sourceId: id('src/1'), limit: 1 },
		],
		[
			{ body: [group], headers: { 'x-total-count': '5' } },
			{ body: [{ id: 'g-2' }], headers: { 'x-total-count': '5' } },
		],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [
		{ json: group, pairedItem: { item: 0 } },
		{ json: { id: 'g-2' }, pairedItem: { item: 1 } },
	]);
	assert.deepEqual(paths(calls), ['/api/Buildings/b%2F1/DeviceGroups', '/api/Sources/src%2F1/DeviceGroups']);
});

test('Device Group List sends every filter and normalizes timestamps to UTC across pages', async () => {
	const { context, calls } = createContext(
		[{
			resource: 'deviceGroup', operation: 'getAll', buildingId: id('b-1'), returnAll: true,
			referenceId: 'ref', metadata: 'k=v', commissionedStatus: 'Commissioned', orderBy: 'ReferenceIdAscending',
			commissionedBefore: '2025-03-01T02:00:00+02:00', decommissionedAfter: '2025-01-01T00:00:00.5Z',
		}],
		[{ body: [{ id: 'g-1' }], headers: { 'x-total-count': '2' } }, { body: [{ id: 'g-2' }], headers: { 'x-total-count': '2' } }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.id), ['g-1', 'g-2']);
	const filters = {
		referenceId: 'ref', metadata: 'k=v', commissionedStatus: 'Commissioned', orderBy: 'ReferenceIdAscending',
		commissionedBefore: '2025-03-01T00:00:00.000Z', decommissionedAfter: '2025-01-01T00:00:00.500Z',
	};
	assert.deepEqual(calls.map(({ qs }) => qs), [{ ...filters, take: 5000, skip: 0 }, { ...filters, take: 5000, skip: 1 }]);
});

test('Device Group List rejects invalid timestamps without making a request', async () => {
	for (const [key, value, message] of [
		['commissionedBefore', '2025-03-01', /Commissioned Before must be an ISO 8601 timestamp/],
		['commissionedBefore', '2025-03-01T00:00:00', /explicit UTC offset/],
		['decommissionedAfter', '2025-02-30T00:00:00Z', /Decommissioned After is not a valid/],
		['decommissionedAfter', 'yesterday', /Decommissioned After must be/],
	]) {
		const { context, calls } = createContext(
			[{ resource: 'deviceGroup', operation: 'getAll', buildingId: id('b-1'), [key]: value }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Device Group List defaults to building scope and Limit 100, omits empty filters, and handles empty results', async () => {
	const { context, calls } = createContext(
		[{ resource: 'deviceGroup', operation: 'getAll', buildingId: id('b-1'), commissionedStatus: '', commissionedBefore: '' }],
		[{ body: [], headers: {} }],
	);
	assert.deepEqual(await new Bdp().execute.call(context), [[]]);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Device Group Get uses selected or manual IDs without requiring a parent', async () => {
	for (const mode of ['list', 'id']) {
		const group = { id: 'g/1', metadata: { a: null } };
		const { context, calls } = createContext(
			[{ resource: 'deviceGroup', operation: 'getById', deviceGroupId: id('g/1', mode) }],
			[{ body: group, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: group, pairedItem: { item: 0 } }]]);
		assert.deepEqual(paths(calls), ['/api/DeviceGroups/g%2F1']);
	}
});

test('Device Group requests are GET-only and no on-demand operation exists', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'deviceGroup', operation: 'getAll', buildingId: id('b-1') },
			{ resource: 'deviceGroup', operation: 'getAll', deviceGroupScope: 'source', sourceId: id('s-1') },
			{ resource: 'deviceGroup', operation: 'getById', deviceGroupId: id('g-1') },
		],
		[{ body: [], headers: {} }, { body: [], headers: {} }, { body: { id: 'g-1' }, headers: {} }],
		[{ json: {} }, { json: {} }, { json: {} }],
	);
	await new Bdp().execute.call(context);
	assert.equal(calls.length, 3);
	for (const call of calls) assert.equal(call.method, 'GET');
	assert.ok(calls.every(({ url }) => !/OnDemand/i.test(url)));
	const operations = new Bdp().description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('deviceGroup'));
	assert.deepEqual(operations.options.map(({ value }) => value), ['getAll', 'getById']);
	for (const operation of ['getOnDemand', 'setOnDemand', 'post']) {
		const { context: c, calls: rejected } = createContext([{ resource: 'deviceGroup', operation }], []);
		await assert.rejects(new Bdp().execute.call(c), /not supported/);
		assert.equal(rejected.length, 0);
	}
});

test('Device Group operations reject missing inputs and invalid limits without requests', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getAll' }, /Building ID is required/],
		[{ operation: 'getAll', deviceGroupScope: 'source', buildingId: id('b-1') }, /Source ID is required/],
		[{ operation: 'getAll', deviceGroupScope: 'source', sourceId: id(' ') }, /Source ID is required/],
		[{ operation: 'getAll', deviceGroupScope: 'floor' }, /supported device group scope/],
		[{ operation: 'getAll', buildingId: id('b-1'), limit: 0 }, /positive whole number/],
		[{ operation: 'getById' }, /Device Group ID is required/],
		[{ operation: 'getById', deviceGroupId: id(' ') }, /Device Group ID is required/],
	]) {
		const { context, calls } = createContext([{ resource: 'deviceGroup', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Device Group operations reject malformed responses and propagate safe API errors', async () => {
	const parameters = (operation) => ({ resource: 'deviceGroup', operation, buildingId: id('b-1'), deviceGroupId: id('g-1') });
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid device group detail response/],
		['getById', null, /invalid device group detail response/],
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

test('Device Group locator searches the selected building or source and pages', async () => {
	const parameters = { deviceGroupScope: 'building', buildingId: id('b/1', 'list'), sourceId: id('src/1') };
	const { context, calls } = createContext([parameters], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `g-${i}`, name: i ? null : 'Pumps' })), headers: {} },
		{ body: [], headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getDeviceGroups.call(context, 'Pu');
	assert.deepEqual(first.results[0], { name: 'Pumps (g-0)', value: 'g-0' });
	assert.deepEqual(first.results[1], { name: 'Device Group g-1', value: 'g-1' });
	assert.equal(first.paginationToken, '50');
	assert.equal((await getDeviceGroups.call(context, 'Pu', first.paginationToken)).paginationToken, undefined);
	parameters.deviceGroupScope = 'source';
	await getDeviceGroups.call(context, 'x');
	assert.deepEqual(paths(calls), [
		'/api/Buildings/b%2F1/DeviceGroups', '/api/Buildings/b%2F1/DeviceGroups', '/api/Sources/src%2F1/DeviceGroups',
	]);
	assert.deepEqual(calls[1].qs, { take: 50, skip: 50, name: 'Pu' });
});

test('Device Group locator rejects missing parents, bad scope, tokens, bad responses and API errors', async () => {
	for (const [deviceGroupScope, parent, pattern] of [
		['building', { buildingId: id('') }, /resolved building ID/],
		['building', { buildingId: id('={{ $json.id }}') }, /resolved building ID/],
		['source', { sourceId: id(' ') }, /resolved source ID/],
	]) {
		const { context, calls } = createContext([{ deviceGroupScope, ...parent }], []);
		await assert.rejects(getDeviceGroups.call(context), pattern);
		assert.equal(calls.length, 0);
	}
	const base = { deviceGroupScope: 'source', sourceId: id('src-1') };
	await assert.rejects(getDeviceGroups.call(createContext([{ ...base, deviceGroupScope: 'x' }], []).context), /supported device group scope/);
	await assert.rejects(getDeviceGroups.call(createContext([base], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getDeviceGroups.call(createContext([base], [{ body: {}, headers: {} }]).context), /invalid device group search response/);
	await assert.rejects(getDeviceGroups.call(createContext([base], [errorWithStatus(403)]).context), /denied access/);
});

test('Device Group properties show only the relevant parent selector and expose a reusable locator', () => {
	const props = new Bdp().description.properties;
	const shown = (name, operation, scope) =>
		props.some((p) => {
			const show = p.displayOptions?.show ?? {};
			return p.name === name && show.resource?.includes('deviceGroup') && show.operation?.includes(operation) &&
				(!show.deviceGroupScope || show.deviceGroupScope.includes(scope));
		});
	for (const operation of ['getAll', 'getById']) {
		assert.ok(shown('buildingId', operation, 'building'));
		assert.ok(!shown('sourceId', operation, 'building'));
		assert.ok(shown('sourceId', operation, 'source'));
		assert.ok(!shown('buildingId', operation, 'source'));
	}
	const scope = props.find((p) => p.name === 'deviceGroupScope' && p.displayOptions.show.operation.includes('getAll'));
	assert.deepEqual(scope.options.map(({ value }) => value), ['building', 'source']);
	const status = props.find((p) => p.name === 'commissionedStatus' && p.displayOptions.show.resource.includes('deviceGroup'));
	assert.equal(status.type, 'options');
	const locator = props.find((p) => p.name === 'deviceGroupId');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'getDeviceGroups');
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[1].type, 'string');
	assert.ok(locator.typeOptions.loadOptionsDependsOn.includes('deviceGroupScope'));
	assert.equal(typeof new Bdp().methods.listSearch.getDeviceGroups, 'function');
});
