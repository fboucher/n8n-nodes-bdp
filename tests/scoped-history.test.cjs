const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const id = (value, mode = 'id') => ({ mode, value });
const window = { start: '2025-01-01T01:00:00+01:00', end: '2025-01-02T00:00:00Z' };
const resources = [
	['floor', 'floorId', 'Floor', '/api/Floors/p%2F1/HistoricalValues'],
	['space', 'spaceId', 'Space', '/api/Spaces/p%2F1/HistoricalValues'],
	['device', 'deviceId', 'Device', '/api/Devices/p%2F1/HistoricalValues'],
	['deviceGroup', 'deviceGroupId', 'Device Group', '/api/DeviceGroups/p%2F1/HistoricalValues'],
];

test('Historical Values reads each new scope directly with a UTC window, ascending order and native values', async () => {
	const history = [
		{ measurementValueId: 'm-1', value: true, timestamp: '2025-01-01T00:00:00Z' },
		{ measurementValueId: 'm-2', value: null, timestamp: '2025-01-01T00:00:01Z' },
	];
	const { context, calls } = createContext(
		resources.map(([resource, parameter, , ], i) => ({
			resource, operation: 'getHistorical', [parameter]: id('p/1', i % 2 ? 'list' : 'id'), ...window, limit: 100,
		})),
		resources.map(() => ({ body: history, headers: {} })),
		resources.map(() => ({ json: {} })),
	);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(calls.length, resources.length, 'no point enumeration');
	assert.deepEqual(paths(calls), resources.map(([, , , path]) => path));
	for (const { qs, method } of calls) {
		assert.equal(method, 'GET');
		assert.deepEqual(qs, { from: '2025-01-01T00:00:00.000Z', to: '2025-01-02T00:00:00.000Z', orderBy: 'TimestampAscending', take: 100, skip: 0 });
	}
	assert.deepEqual(output.map(({ json, pairedItem }) => [json.measurementValueId, json.value, pairedItem.item]),
		resources.flatMap((_, i) => [['m-1', true, i], ['m-2', null, i]]));
});

test('Historical Values paginates with Return All and honours Limit for every new scope', async () => {
	for (const [resource, parameter, , path] of resources) {
		const { context, calls } = createContext(
			[{ resource, operation: 'getHistorical', [parameter]: id('p/1'), ...window, returnAll: true }],
			[{ body: [{ measurementValueId: 'a' }], headers: { 'x-total-count': '3' } },
				{ body: [{ measurementValueId: 'b' }], headers: { 'x-total-count': '3' } },
				{ body: [{ measurementValueId: 'c' }], headers: { 'x-total-count': '3' } }],
		);
		const [output] = await new Bdp().execute.call(context);
		assert.deepEqual(output.map(({ json }) => json.measurementValueId), ['a', 'b', 'c']);
		assert.deepEqual(calls.map(({ qs }) => qs.skip), [0, 1, 2]);
		assert.ok(calls.every(({ url }) => new URL(url).pathname === path));

		const { context: limited, calls: limitedCalls } = createContext(
			[{ resource, operation: 'getHistorical', [parameter]: id('p/1'), ...window, limit: 1 }],
			[{ body: [{ measurementValueId: 'a' }], headers: { 'x-total-count': '9' } }],
		);
		const [limitedOutput] = await new Bdp().execute.call(limited);
		assert.equal(limitedOutput.length, 1);
		assert.equal(limitedCalls.length, 1);
		assert.equal(limitedCalls[0].qs.take, 1);
	}
});

test('Historical Values defaults to Limit 100 and returns no items for an empty window', async () => {
	for (const [resource, parameter] of resources) {
		const { context, calls } = createContext(
			[{ resource, operation: 'getHistorical', [parameter]: id('p-1'), ...window }], [{ body: [], headers: {} }]);
		assert.deepEqual(await new Bdp().execute.call(context), [[]]);
		assert.equal(calls[0].qs.take, 100);
	}
});

test('Historical Values rejects invalid windows, limits and missing IDs before any request', async () => {
	for (const [resource, parameter, label] of resources) {
		for (const [parameters, message] of [
			[{ [parameter]: id('p-1'), start: '2025-01-02T00:00:00Z', end: '2025-01-01T00:00:00Z' }, /Start must be earlier than End/],
			[{ [parameter]: id('p-1'), start: '2025-01-01T00:00:00Z', end: '2025-01-01T00:00:00Z' }, /Start must be earlier than End/],
			[{ [parameter]: id('p-1'), start: '2025-01-01', end: '2025-01-02T00:00:00Z' }, /Start must be an ISO 8601 timestamp/],
			[{ [parameter]: id('p-1'), start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00' }, /End must be an ISO 8601 timestamp/],
			[{ [parameter]: id('p-1'), ...window, limit: 0 }, /positive whole number/],
			[{ ...window }, new RegExp(`${label} ID is required`)],
			[{ [parameter]: id(' '), ...window }, new RegExp(`${label} ID is required`)],
		]) {
			const { context, calls } = createContext([{ resource, operation: 'getHistorical', ...parameters }], []);
			await assert.rejects(new Bdp().execute.call(context), message);
			assert.equal(calls.length, 0);
		}
	}
});

test('Historical Values fails without partial output when a later page fails, and hides API details', async () => {
	for (const [resource, parameter] of resources) {
		const { context, calls } = createContext(
			[{ resource, operation: 'getHistorical', [parameter]: id('p-1'), ...window, returnAll: true }],
			[{ body: [{ measurementValueId: 'a' }], headers: { 'x-total-count': '2' } }, errorWithStatus(403)],
		);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, /denied access/);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
		assert.equal(calls.length, 2);
	}
});

test('Historical Values rejects malformed responses', async () => {
	for (const [resource, parameter] of resources) {
		const { context } = createContext(
			[{ resource, operation: 'getHistorical', [parameter]: id('p-1'), ...window }], [{ body: {}, headers: {} }]);
		await assert.rejects(new Bdp().execute.call(context), /invalid list response/);
	}
});

test('Historical Values supports continue-on-fail and preserves input linking', async () => {
	const { context } = createContext(
		[
			{ resource: 'device', operation: 'getHistorical', ...window },
			{ resource: 'device', operation: 'getHistorical', deviceId: id('d-2'), ...window },
		],
		[{ body: [{ measurementValueId: 'a' }], headers: {} }],
		[{ json: {} }, { json: {} }],
		true,
	);
	const [output] = await new Bdp().execute.call(context);
	assert.match(output[0].json.error, /Device ID is required/);
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.deepEqual(output[1], { json: { measurementValueId: 'a' }, pairedItem: { item: 1 } });
});

test('Existing Building and Measurement Point history keep their routes and window handling', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'building', operation: 'getHistorical', buildingId: id('b-1'), ...window, limit: 100 },
			{ resource: 'measurementValue', operation: 'getHistorical', measurementId: id('m-1'), ...window, limit: 100 },
		],
		[{ body: [], headers: {} }, { body: [], headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	await new Bdp().execute.call(context);
	assert.deepEqual(paths(calls), ['/api/Buildings/b-1/HistoricalValues', '/api/MeasurementValue/m-1/HistoricalValues']);
	for (const { qs } of calls) {
		assert.deepEqual(qs, { from: '2025-01-01T00:00:00.000Z', to: '2025-01-02T00:00:00.000Z', orderBy: 'TimestampAscending', take: 100, skip: 0 });
	}
});

test('Historical Values is a consistent per-resource operation with the right selectors shown', () => {
	const props = new Bdp().description.properties;
	for (const [resource, parameter] of resources) {
		const operation = props.find((p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource));
		assert.deepEqual(operation.options.map(({ value }) => value), ['getAll', 'getById', 'getHistorical']);
		const shows = (name) => props.some((p) => p.name === name && (!p.displayOptions?.show?.resource || p.displayOptions.show.resource.includes(resource)) &&
			p.displayOptions.show.operation?.includes('getHistorical'));
		assert.ok(shows(parameter), `${resource}: ${parameter} locator is shown for Historical Values`);
		for (const name of ['start', 'end', 'returnAll', 'limit']) assert.ok(shows(name), `${resource}: ${name}`);
		assert.ok(!shows('name'), `${resource}: list-only filters are not shown`);
		const locator = props.find((p) => p.name === parameter && p.displayOptions?.show?.resource?.includes(resource) &&
			p.displayOptions.show.operation.includes('getHistorical'));
		assert.notEqual(locator.required, false, `${resource}: ${parameter} is required`);
	}
	const floorBuilding = props.find((p) => p.name === 'buildingId' && p.displayOptions?.show?.resource?.includes('floor') &&
		p.displayOptions.show.operation.includes('getHistorical'));
	assert.equal(floorBuilding.required, false);
});
