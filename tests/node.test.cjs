const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getBuildings } = require('../dist/nodes/Bdp/listSearch/getBuildings.js');
const { getMeasurementValues } = require('../dist/nodes/Bdp/listSearch/getMeasurementValues.js');

function createContext(parameters, responses, inputItems = [{ json: {} }], continueOnFail = false) {
	const calls = [];
	let callCount = 0;
	return {
		calls,
		context: {
			getNode: () => ({ name: 'Test BDP Node', type: 'n8n-nodes-bdp.bdp' }),
			getInputData: () => inputItems,
			getNodeParameter(name, itemIndex, defaultValue, options) {
				const isLoadOptionsCall = typeof itemIndex !== 'number';
				const itemParameters = isLoadOptionsCall
					? (parameters[0] ?? {})
					: (parameters[itemIndex] ?? parameters[0] ?? {});
				if (isLoadOptionsCall) {
					options = defaultValue;
					defaultValue = itemIndex;
				}
				let value = itemParameters[name] ?? defaultValue;
				if (options?.extractValue && value && typeof value === 'object') {
					value = value.value;
				}
				return value;
			},
			getCredentials: async () => ({ environment: 'uat' }),
			continueOnFail: () => continueOnFail,
			helpers: {
				httpRequestWithAuthentication: async function (_credentialType, options) {
					calls.push(options);
					const response = responses[callCount++];
					if (response instanceof Error) throw response;
					if (typeof response === 'function') return response(options);
					return response ?? { body: [], headers: {} };
				},
			},
		},
	};
}

function errorWithStatus(statusCode, headers = {}) {
	const error = new Error('private response body must not leak');
	error.response = { statusCode, headers, body: 'private response body must not leak' };
	return error;
}

test('Building List returns all pages by default and preserves server-side filtering and item links', async () => {
	const buildings = [
		{ id: 'b-1', name: 'North', metadata: null, count: 4 },
		{ id: 'b-2', name: 'North Annex', metadata: null, count: 2 },
		{ id: 'b-3', name: 'North Tower', metadata: null, count: 1 },
	];
	const { context, calls } = createContext(
		[{ resource: 'building', operation: 'getAll', name: 'North' }],
		[
			{ body: buildings.slice(0, 2), headers: { 'x-total-count': '3' } },
			{ body: buildings.slice(2), headers: { 'x-total-count': '3' } },
		],
		[{ json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, buildings.map((json) => ({ json, pairedItem: { item: 0 } })));
	assert.ok(calls.every((call) => call.url.endsWith('/api/Buildings')));
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ name: 'North', take: 5000, skip: 0 },
		{ name: 'North', take: 5000, skip: 2 },
	]);
});

test('Building List can be explicitly limited instead of returning all', async () => {
	const { context, calls } = createContext(
		[
			{
				resource: 'building',
				operation: 'getAll',
				returnAllBuildings: false,
				buildingLimit: 2,
			},
		],
		[{ body: [{ id: 'b-1' }, { id: 'b-2' }], headers: { 'x-total-count': '3' } }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.id), ['b-1', 'b-2']);
	assert.equal(calls[0].qs.take, 2);
});

test('Building Get requires an ID and calls the dedicated detail endpoint', async () => {
	const building = { id: 'b-1', name: 'North', siteId: 'site-1', floorCount: 2 };
	const { context, calls } = createContext(
		[
			{
				resource: 'building',
				operation: 'getById',
				buildingId: { mode: 'id', value: 'building/1' },
			},
		],
		[{ body: building, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: building, pairedItem: { item: 0 } }]);
	assert.equal(calls.length, 1);
	assert.ok(calls[0].url.endsWith('/api/Buildings/building%2F1'));
	assert.deepEqual(calls[0].qs, {});
});

test('Building Get fails clearly without an ID and does not request the collection endpoint', async () => {
	const { context, calls } = createContext(
		[{ resource: 'building', operation: 'getById' }],
		[],
	);
	await assert.rejects(new Bdp().execute.call(context), /Building ID is required/);
	assert.equal(calls.length, 0);
});

test('Building operations are presented as distinct List, Get, and Historical Values', () => {
	const operations = new Bdp().description.properties.find(
		({ name, displayOptions }) =>
			name === 'operation' && displayOptions?.show?.resource?.includes('building'),
	);
	assert.deepEqual(
		operations.options.map(({ name, value }) => ({ name, value })),
		[
			{ name: 'List', value: 'getAll' },
			{ name: 'Get', value: 'getById' },
			{ name: 'Historical Values', value: 'getHistorical' },
		],
	);
	const buildingId = new Bdp().description.properties.find(
		({ name }) => name === 'buildingId',
	);
	assert.deepEqual(buildingId.displayOptions.show.operation, ['getById', 'getHistorical']);
	assert.equal(
		new Bdp().description.properties.find(({ name }) => name === 'returnAllBuildings').default,
		true,
	);
});

test('lists measurement points using a scoped building route and all server filters', async () => {
	const { context, calls } = createContext(
		[
			{
				resource: 'measurementValue',
				operation: 'getAll',
				buildingId: { mode: 'id', value: 'building/1' },
				name: 'Temperature',
				ontologyType: 'Sensor',
				unit: 'C',
				limit: 100,
			},
		],
		[{ body: [{ id: 'm-1', value: 21.5 }], headers: {} }],
	);
	await new Bdp().execute.call(context);
	assert.equal(calls[0].url.endsWith('/api/Buildings/building%2F1/MeasurementValues'), true);
	assert.deepEqual(calls[0].qs, {
		name: 'Temperature',
		ontologyType: 'Sensor',
		unit: 'C',
		take: 100,
		skip: 0,
	});
});

test('reads point history from the singular route with normalized UTC window and native values', async () => {
	const history = [
		{ measurementValueId: 'm-1', value: true, timestamp: '2025-01-01T00:00:00Z' },
		{ measurementValueId: 'm-1', value: null, timestamp: '2025-01-01T00:00:01Z' },
	];
	const { context, calls } = createContext(
		[
			{
				resource: 'measurementValue',
				operation: 'getHistorical',
				measurementId: { mode: 'id', value: 'm-1' },
				start: '2025-01-01T01:00:00+01:00',
				end: '2025-01-02T00:00:00Z',
				limit: 100,
			},
		],
		[{ body: history, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json), history);
	assert.ok(output.every(({ pairedItem }) => pairedItem.item === 0));
	assert.equal(calls[0].url.endsWith('/api/MeasurementValue/m-1/HistoricalValues'), true);
	assert.equal(calls[0].qs.from, '2025-01-01T00:00:00.000Z');
	assert.equal(calls[0].qs.to, '2025-01-02T00:00:00.000Z');
	assert.equal(calls[0].qs.orderBy, 'TimestampAscending');
});

test('reads building-wide history directly without point enumeration', async () => {
	const { context, calls } = createContext(
		[
			{
				resource: 'building',
				operation: 'getHistorical',
				buildingId: { mode: 'id', value: 'b-1' },
				start: '2025-01-01T00:00:00Z',
				end: '2025-01-02T00:00:00Z',
				limit: 100,
			},
		],
		[{ body: [{ measurementValueId: 'm-1', value: 0, timestamp: null }], headers: {} }],
	);
	await new Bdp().execute.call(context);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url.endsWith('/api/Buildings/b-1/HistoricalValues'), true);
});

test('returns zero output items for an empty successful list', async () => {
	const { context } = createContext(
		[{ resource: 'building', operation: 'getAll', limit: 100 }],
		[{ body: [], headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, []);
});

test('preserves per-input expressions and output item linking', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'building', operation: 'getHistorical', buildingId: { mode: 'id', value: 'b-1' }, start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z', limit: 100 },
			{ resource: 'building', operation: 'getHistorical', buildingId: { mode: 'id', value: 'b-2' }, start: '2025-01-02T00:00:00Z', end: '2025-01-03T00:00:00Z', limit: 100 },
		],
		[
			{ body: [{ measurementValueId: 'm-1', value: 1, timestamp: null }], headers: {} },
			{ body: [{ measurementValueId: 'm-2', value: 2, timestamp: null }], headers: {} },
		],
		[{ json: { id: 'b-1' } }, { json: { id: 'b-2' } }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ pairedItem }) => pairedItem.item), [0, 1]);
	assert.ok(calls[0].url.endsWith('/api/Buildings/b-1/HistoricalValues'));
	assert.ok(calls[1].url.endsWith('/api/Buildings/b-2/HistoricalValues'));
});

test('rejects invalid time windows before making a BDP request', async () => {
	const { context, calls } = createContext(
		[
			{
				resource: 'building',
				operation: 'getHistorical',
				buildingId: { mode: 'id', value: 'b-1' },
				start: '2025-01-02T00:00:00Z',
				end: '2025-01-01T00:00:00Z',
				limit: 100,
			},
		],
		[],
	);
	await assert.rejects(new Bdp().execute.call(context), /Start must be earlier than End/);
	assert.equal(calls.length, 0);
});

test('continue-on-fail returns a linked error item instead of successful partial output', async () => {
	const { context } = createContext(
		[{ resource: 'building', operation: 'getAll', limit: 100 }],
		[errorWithStatus(403)],
		[{ json: {} }],
		true,
	);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(output.length, 1);
	assert.equal(output[0].pairedItem.item, 0);
	assert.match(output[0].json.error, /denied access/);
	assert.doesNotMatch(output[0].json.error, /private response body/);
});

test('building selector searches by name and returns an incremental next page', async () => {
	const buildings = Array.from({ length: 50 }, (_, index) => ({
		id: `b-${index}`,
		name: `Building ${index}`,
	}));
	const { context, calls } = createContext(
		[{}],
		[{ body: buildings, headers: {} }],
	);
	const result = await getBuildings.call(context, 'North', '50');
	assert.equal(calls[0].url.endsWith('/api/Buildings'), true);
	assert.deepEqual(calls[0].qs, { take: 50, skip: 50, name: 'North' });
	assert.equal(result.results[0].name, 'Building 0 (b-0)');
	assert.equal(result.results[0].value, 'b-0');
	assert.equal(result.paginationToken, '100');
});

test('measurement selector requires a resolved building and safely scopes its query', async () => {
	const { context: noBuilding, calls: emptyCalls } = createContext([{}], []);
	await assert.rejects(
		getMeasurementValues.call(noBuilding, undefined, undefined),
		/resolved building ID/,
	);
	assert.equal(emptyCalls.length, 0);

	const { context, calls } = createContext(
		[{ buildingId: { mode: 'id', value: 'b/1' } }],
		[{ body: [{ id: 'm-1', name: 'Temperature' }], headers: {} }],
	);
	const result = await getMeasurementValues.call(context, 'Temp', '50');
	assert.equal(
		calls[0].url.endsWith('/api/Buildings/b%2F1/MeasurementValues'),
		true,
	);
	assert.deepEqual(calls[0].qs, { take: 50, skip: 50, name: 'Temp' });
	assert.deepEqual(result.results[0], { name: 'Temperature (m-1)', value: 'm-1' });
});

test('Building List scopes to an organization or site and sends optional filters only when set', async () => {
	for (const [scope, params, prefix] of [
		['organization', { organizationId: { mode: 'id', value: 'org/1' } }, '/api/Organizations/org%2F1/Buildings'],
		['site', { siteId: { mode: 'id', value: 'site-1' } }, '/api/Sites/site-1/Buildings'],
	]) {
		const { context, calls } = createContext(
			[
				{
					resource: 'building',
					operation: 'getAll',
					buildingScope: scope,
					...params,
					buildingFilters: { referenceId: 'ref', floorCount: 3, includeCounts: true, orderBy: 'Name' },
				},
			],
			[
				{ body: [{ id: 'b-1' }, { id: 'b-2' }], headers: { 'x-total-count': '3' } },
				{ body: [{ id: 'b-3' }], headers: { 'x-total-count': '3' } },
			],
		);
		const [output] = await new Bdp().execute.call(context);
		assert.equal(output.length, 3);
		assert.ok(calls.every((c) => c.url.endsWith(prefix)));
		for (const c of calls) {
			assert.equal(c.qs.referenceId, 'ref');
			assert.equal(c.qs.floorCount, 3);
			assert.equal(c.qs.includeCounts, true);
			assert.equal(c.qs.orderBy, 'Name');
			assert.equal('metadata' in c.qs, false);
		}
	}
});

test('Building List scope requires an ID', async () => {
	const { context, calls } = createContext(
		[{ resource: 'building', operation: 'getAll', buildingScope: 'site' }],
		[],
	);
	await assert.rejects(new Bdp().execute.call(context), /Site ID is required/);
	assert.equal(calls.length, 0);
});

test('Building Get sends includeCounts only when requested', async () => {
	const { context, calls } = createContext(
		[
			{
				resource: 'building',
				operation: 'getById',
				buildingId: { mode: 'id', value: 'b-1' },
				buildingGetOptions: { includeCounts: true },
			},
		],
		[{ body: { id: 'b-1' }, headers: {} }],
	);
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].qs, { includeCounts: true });
});

test('Building locator respects a selected site or organization', async () => {
	for (const [scope, path] of [
		[{ siteId: 's 1' }, '/api/Sites/s%201/Buildings'],
		[{ organizationId: 'o1' }, '/api/Organizations/o1/Buildings'],
	]) {
		const { context, calls } = createContext([{}], [{ body: [], headers: {} }]);
		context.getCurrentNodeParameter = () => scope;
		await getBuildings.call(context);
		assert.ok(calls[0].url.endsWith(path));
	}
});
