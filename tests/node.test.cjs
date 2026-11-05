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

test('lists buildings as individually linked native records with server-side name filtering', async () => {
	const buildings = [{ id: 'b-1', name: 'North', metadata: null, count: 4 }];
	const { context, calls } = createContext(
		[{ resource: 'building', operation: 'getAll', name: 'North', limit: 100 }],
		[{ body: buildings, headers: {} }],
		[{ json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: buildings[0], pairedItem: { item: 0 } }]);
	assert.equal(calls[0].url.endsWith('/api/Buildings'), true);
	assert.equal(calls[0].qs.name, 'North');
	assert.equal(calls[0].qs.take, 100);
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
