const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getBuildings } = require('../dist/nodes/Bdp/listSearch/getBuildings.js');
const { getMeasurementValues } = require('../dist/nodes/Bdp/listSearch/getMeasurementValues.js');
const { getOrganizations } = require('../dist/nodes/Bdp/resources/organization/listSearch.js');
const { getSites } = require('../dist/nodes/Bdp/resources/site/listSearch.js');
const { getFloors } = require('../dist/nodes/Bdp/resources/floor/listSearch.js');

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

test('Floor List uses the building route and retains native types, filters and links across pages', async () => {
	const floor = { id: 'f-1', name: 'Ground', metadata: null, spaceCount: 0, active: true };
	const filters = {
		name: 'Ground', referenceId: 'ref', metadata: 'key=value',
		spaceCount: 0, measurementCount: 3, orderBy: 'NameAscending',
	};
	const { context, calls } = createContext([
		{ resource: 'floor', operation: 'getAll', buildingId: { mode: 'list', value: 'b/1' }, returnAll: true, ...filters },
		{ resource: 'floor', operation: 'getAll', buildingId: { mode: 'id', value: 'b/2' }, limit: 1 },
	], [
		{ body: [floor], headers: { 'x-total-count': '2' } },
		{ body: [{ id: 'f-2' }], headers: { 'x-total-count': '2' } },
		{ body: [{ id: 'f-3' }], headers: { 'x-total-count': '3' } },
	], [{ json: {} }, { json: {} }]);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [
		{ json: floor, pairedItem: { item: 0 } },
		{ json: { id: 'f-2' }, pairedItem: { item: 0 } },
		{ json: { id: 'f-3' }, pairedItem: { item: 1 } },
	]);
	assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
		'/api/Buildings/b%2F1/Floors', '/api/Buildings/b%2F1/Floors', '/api/Buildings/b%2F2/Floors',
	]);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ ...filters, take: 5000, skip: 0 },
		{ ...filters, take: 5000, skip: 1 },
		{ take: 1, skip: 0 },
	]);
});

test('Floor List defaults to Limit 100 and returns no items for an empty collection', async () => {
	const { context, calls } = createContext(
		[{ resource: 'floor', operation: 'getAll', buildingId: { mode: 'id', value: 'b-1' } }],
		[{ body: [], headers: {} }],
	);
	assert.deepEqual(await new Bdp().execute.call(context), [[]]);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Floor Get uses selected or manual IDs without requiring a building', async () => {
	for (const mode of ['list', 'id']) {
		const floor = { id: 'f/1', metadata: { reference: null }, spaceCount: 2 };
		const { context, calls } = createContext(
			[{ resource: 'floor', operation: 'getById', floorId: { mode, value: 'f/1' } }],
			[{ body: floor, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: floor, pairedItem: { item: 0 } }]]);
		assert.equal(new URL(calls[0].url).pathname, '/api/Floors/f%2F1');
		assert.deepEqual(calls[0].qs, {});
	}
});

test('Floor operations reject missing IDs and invalid limits without making requests', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getAll' }, /Building ID is required/],
		[{ operation: 'getAll', buildingId: { mode: 'id', value: ' ' } }, /Building ID is required/],
		[{ operation: 'getAll', buildingId: { mode: 'id', value: 'b-1' }, limit: 0 }, /Limit must/],
		[{ operation: 'getById' }, /Floor ID is required/],
		[{ operation: 'getById', floorId: { mode: 'id', value: ' ' } }, /Floor ID is required/],
		[{ operation: 'invalid' }, /not supported/],
	]) {
		const { context, calls } = createContext([{ resource: 'floor', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Floor operations reject malformed responses and propagate safe API errors', async () => {
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid floor detail response/],
		['getById', null, /invalid floor detail response/],
		['getById', 'invalid', /invalid floor detail response/],
	]) {
		const { context } = createContext([{
			resource: 'floor', operation, buildingId: { mode: 'id', value: 'b-1' },
			floorId: { mode: 'id', value: 'f-1' },
		}], [{ body, headers: {} }]);
		await assert.rejects(new Bdp().execute.call(context), message);
	}
	for (const operation of ['getAll', 'getById']) {
		const { context, calls } = createContext([{
			resource: 'floor', operation, returnAll: true,
			buildingId: { mode: 'id', value: 'b-1' }, floorId: { mode: 'id', value: 'f-1' },
		}], operation === 'getAll' ? [
			{ body: [{ id: 'f-1' }], headers: { 'x-total-count': '2' } },
			errorWithStatus(403),
		] : [errorWithStatus(404)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, operation === 'getAll' ? /denied access/ : /HTTP 404/);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
		assert.equal(calls.length, operation === 'getAll' ? 2 : 1);
	}
});

test('Floor failures support continue-on-fail and preserve input linking', async () => {
	const { context } = createContext([
		{ resource: 'floor', operation: 'getById' },
		{ resource: 'floor', operation: 'getById', floorId: { mode: 'id', value: 'f-2' } },
	], [{ body: { id: 'f-2' }, headers: {} }], [{ json: {} }, { json: {} }], true);
	const [output] = await new Bdp().execute.call(context);
	assert.match(output[0].json.error, /Floor ID is required/);
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.deepEqual(output[1], { json: { id: 'f-2' }, pairedItem: { item: 1 } });
});

test('Floor search reads the current building for each search and supports filtering and paging', async () => {
	const parameters = { buildingId: { mode: 'list', value: 'b/1' } };
	const { context, calls } = createContext([parameters], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `f-${i}`, name: i ? null : 'Ground' })), headers: {} },
		{ body: [{ id: 'f-50', name: 'First' }], headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getFloors.call(context, 'Ground');
	assert.deepEqual(first.results[0], { name: 'Ground (f-0)', value: 'f-0' });
	assert.deepEqual(first.results[1], { name: 'Floor f-1', value: 'f-1' });
	assert.equal(first.paginationToken, '50');
	const second = await getFloors.call(context, 'Ground', first.paginationToken);
	assert.equal(second.paginationToken, undefined);
	parameters.buildingId = { mode: 'id', value: 'b/2' };
	assert.deepEqual(await getFloors.call(context, 'New'), { results: [], paginationToken: undefined });
	assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
		'/api/Buildings/b%2F1/Floors', '/api/Buildings/b%2F1/Floors', '/api/Buildings/b%2F2/Floors',
	]);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ take: 50, skip: 0, name: 'Ground' },
		{ take: 50, skip: 50, name: 'Ground' },
		{ take: 50, skip: 0, name: 'New' },
	]);
	parameters.buildingId = { mode: 'id', value: '' };
	await assert.rejects(getFloors.call(context), /resolved building ID/);
	assert.equal(calls.length, 3);
});

test('Floor search rejects unresolved buildings, invalid pagination, malformed responses and API failures', async () => {
	for (const value of ['', undefined, ' ', '={{ $json.buildingId }}']) {
		const { context, calls } = createContext([{ buildingId: { mode: 'id', value } }], []);
		await assert.rejects(getFloors.call(context), /resolved building ID/);
		assert.equal(calls.length, 0);
	}
	const { context, calls } = createContext([{ buildingId: { mode: 'id', value: 'b-1' } }], []);
	await assert.rejects(getFloors.call(context, '', '-1'), /pagination token/);
	assert.equal(calls.length, 0);
	for (const [response, message] of [
		[{ body: {}, headers: {} }, /invalid floor search response/],
		[errorWithStatus(403), /denied access/],
	]) {
		const { context } = createContext([{ buildingId: { mode: 'id', value: 'b-1' } }], [response]);
		await assert.rejects(getFloors.call(context), message);
	}
});

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

test('Building List keeps the default request and native output unchanged', async () => {
	const building = { id: 'b-1', metadata: null, floorCount: 0 };
	const { context, calls } = createContext(
		[{ resource: 'building', operation: 'getAll' }],
		[{ body: [building], headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: building, pairedItem: { item: 0 } }]);
	assert.equal(new URL(calls[0].url).pathname, '/api/Buildings');
	assert.deepEqual(calls[0].qs, { take: 5000, skip: 0 });
});

test('Building List applies all optional filters across pages in every scope', async () => {
	for (const [scope, idParameter, path] of [
		['all', null, '/api/Buildings'],
		['organization', 'organizationId', '/api/Organizations/parent%2F1/Buildings'],
		['site', 'siteId', '/api/Sites/parent%2F1/Buildings'],
	]) {
		const params = {
			resource: 'building', operation: 'getAll', scope,
			name: 'North', referenceId: 'ref', metadata: 'key=value',
			floorCount: 0, spaceCount: 2, measurementCount: 3,
			includeCounts: true, orderBy: 'NameAscending',
		};
		if (idParameter) params[idParameter] = { mode: 'id', value: 'parent/1' };
		const { context, calls } = createContext([params], [
			{ body: [{ id: 'b-1' }], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'b-2' }], headers: { 'x-total-count': '2' } },
		]);
		const [output] = await new Bdp().execute.call(context);
		assert.deepEqual(output.map(({ json }) => json.id), ['b-1', 'b-2']);
		assert.ok(calls.every(({ url }) => new URL(url).pathname === path));
		const filters = {
			name: 'North', referenceId: 'ref', metadata: 'key=value',
			floorCount: 0, spaceCount: 2, measurementCount: 3,
			includeCounts: true, orderBy: 'NameAscending', take: 5000,
		};
		assert.deepEqual(calls.map(({ qs }) => qs), [
			{ ...filters, skip: 0 }, { ...filters, skip: 1 },
		]);
	}
});

test('Building List rejects missing parents and invalid scopes before requesting', async () => {
	for (const scope of ['organization', 'site', 'invalid']) {
		const { context, calls } = createContext([{ resource: 'building', operation: 'getAll', scope }], []);
		await assert.rejects(new Bdp().execute.call(context), scope === 'invalid' ? /supported building scope/ : /ID is required/);
		assert.equal(calls.length, 0);
	}
});

test('Building Get can request counts without changing its output', async () => {
	const building = { id: 'b-1', floorCount: 0, spaceCount: 4 };
	const { context, calls } = createContext(
		[{ resource: 'building', operation: 'getById', buildingId: { mode: 'id', value: 'b-1' }, includeCounts: true }],
		[{ body: building, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: building, pairedItem: { item: 0 } }]);
	assert.deepEqual(calls[0].qs, { includeCounts: true });
});

test('Building search scopes use selected locators and ignore stale organization on site searches', async () => {
	for (const [scope, idParameter, path] of [
		['all', null, '/api/Buildings'],
		['organization', 'organizationId', '/api/Organizations/parent%2F1/Buildings'],
		['site', 'siteId', '/api/Sites/parent%2F1/Buildings'],
	]) {
		const params = { buildingSearchScope: scope };
		if (idParameter) params[idParameter] = { mode: 'id', value: 'parent/1' };
		const { context, calls } = createContext([params], [{ body: [{ id: 'b-1', name: 'North' }], headers: {} }]);
		assert.deepEqual((await getBuildings.call(context, 'North', '50')).results, [{ name: 'North (b-1)', value: 'b-1' }]);
		assert.equal(new URL(calls[0].url).pathname, path);
		assert.deepEqual(calls[0].qs, { take: 50, skip: 50, name: 'North' });
	}
	for (const scope of ['organization', 'site']) {
		const { context, calls } = createContext([{ buildingSearchScope: scope }], []);
		await assert.rejects(getBuildings.call(context), /resolved .* ID/);
		assert.equal(calls.length, 0);
	}
	const { context, calls } = createContext(
		[{ resource: 'building', organizationId: { mode: 'id', value: 'stale' } }],
		[{ body: [], headers: {} }],
	);
	await getSites.call(context);
	assert.equal(new URL(calls[0].url).pathname, '/api/Sites');
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

test('Organization List applies supported filters across pages and Get returns a native record', async () => {
	const organizations = [
		{ id: 'o-1', name: 'North', siteCount: 2, active: true },
		{ id: 'o-2', name: 'South', siteCount: 0, active: false },
	];
	const { context, calls } = createContext(
		[
			{
				resource: 'organization',
				operation: 'getAll',
				name: 'Region',
				siteCount: 0,
				orderBy: 'NameAscending',
				returnAll: true,
			},
		],
		[
			{ body: organizations.slice(0, 1), headers: { 'x-total-count': '2' } },
			{ body: organizations.slice(1), headers: { 'x-total-count': '2' } },
		],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, organizations.map((json) => ({ json, pairedItem: { item: 0 } })));
	assert.deepEqual(calls.map(({ url, qs }) => ({
		path: new URL(url).pathname,
		qs,
	})), [
		{ path: '/api/Organizations', qs: { name: 'Region', siteCount: 0, orderBy: 'NameAscending', take: 5000, skip: 0 } },
		{ path: '/api/Organizations', qs: { name: 'Region', siteCount: 0, orderBy: 'NameAscending', take: 5000, skip: 1 } },
	]);

	const { context: getContext, calls: getCalls } = createContext(
		[{ resource: 'organization', operation: 'getById', organizationId: { mode: 'id', value: 'org/1' } }],
		[{ body: organizations[0], headers: {} }],
	);
	const [getOutput] = await new Bdp().execute.call(getContext);
	assert.deepEqual(getOutput[0].json, organizations[0]);
	assert.equal(new URL(getCalls[0].url).pathname, '/api/Organizations/org%2F1');
});

test('Organization Get rejects a missing ID and a non-record detail response', async () => {
	const { context, calls } = createContext(
		[{ resource: 'organization', operation: 'getById' }],
		[],
	);
	await assert.rejects(new Bdp().execute.call(context), /Organization ID is required/);
	assert.equal(calls.length, 0);

	const { context: invalidContext } = createContext(
		[{ resource: 'organization', operation: 'getById', organizationId: { mode: 'id', value: 'o-1' } }],
		[{ body: [], headers: {} }],
	);
	await assert.rejects(new Bdp().execute.call(invalidContext), /invalid organization detail response/);
});

test('Site List supports accessible and organization-scoped endpoints with filters and empty results', async () => {
	const { context, calls } = createContext(
		[
			{
				resource: 'site',
				operation: 'getAll',
				scope: 'all',
				name: 'West',
				metadata: 'region:west',
				buildingCount: 0,
				orderBy: 'NameAscending',
				returnAll: false,
				limit: 5,
			},
		],
		[{ body: [], headers: {} }],
	);
	const [emptyOutput] = await new Bdp().execute.call(context);
	assert.deepEqual(emptyOutput, []);
	assert.equal(new URL(calls[0].url).pathname, '/api/Sites');
	assert.deepEqual(calls[0].qs, {
		name: 'West',
		metadata: 'region:west',
		buildingCount: 0,
		orderBy: 'NameAscending',
		take: 5,
		skip: 0,
	});

	const sites = [{ id: 's-1', name: 'West', buildingCount: 0, metadata: { region: 'west' } }];
	const { context: scopedContext, calls: scopedCalls } = createContext(
		[
			{
				resource: 'site',
				operation: 'getAll',
				scope: 'organization',
				organizationId: { mode: 'id', value: 'org/1' },
				name: 'West',
				metadata: 'region:west',
				buildingCount: 0,
				orderBy: 'NameAscending',
				returnAll: true,
			},
		],
		[
			{ body: sites, headers: {} },
			{ body: [], headers: {} },
		],
	);
	const [scopedOutput] = await new Bdp().execute.call(scopedContext);
	assert.deepEqual(scopedOutput.map(({ json }) => json), sites);
	assert.equal(new URL(scopedCalls[0].url).pathname, '/api/Organizations/org%2F1/Sites');
	assert.deepEqual(scopedCalls[0].qs, {
		name: 'West',
		metadata: 'region:west',
		buildingCount: 0,
		orderBy: 'NameAscending',
		take: 5000,
		skip: 0,
	});
});

test('Site List requires an organization only in that scope and rejects invalid scope', async () => {
	const { context, calls } = createContext(
		[{ resource: 'site', operation: 'getAll', scope: 'organization' }],
		[],
	);
	await assert.rejects(new Bdp().execute.call(context), /Organization ID is required/);
	assert.equal(calls.length, 0);

	const { context: invalidContext } = createContext(
		[{ resource: 'site', operation: 'getAll', scope: 'unknown' }],
		[],
	);
	await assert.rejects(new Bdp().execute.call(invalidContext), /supported site scope/);
});

test('Site Get uses the detail endpoint and validates IDs and response records', async () => {
	const site = { id: 'site/1', name: 'North', buildingCount: 2, metadata: null };
	const { context, calls } = createContext(
		[{ resource: 'site', operation: 'getById', siteId: { mode: 'id', value: 'site/1' } }],
		[{ body: site, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output[0].json, site);
	assert.equal(new URL(calls[0].url).pathname, '/api/Sites/site%2F1');

	const { context: missingContext, calls: missingCalls } = createContext(
		[{ resource: 'site', operation: 'getById' }],
		[],
	);
	await assert.rejects(new Bdp().execute.call(missingContext), /Site ID is required/);
	assert.equal(missingCalls.length, 0);

	const { context: invalidContext } = createContext(
		[{ resource: 'site', operation: 'getById', siteId: { mode: 'id', value: 's-1' } }],
		[{ body: null, headers: {} }],
	);
	await assert.rejects(new Bdp().execute.call(invalidContext), /invalid site detail response/);
});

test('organization and site locators search by name and site search scopes only when an organization is selected', async () => {
	const organization = { id: 'o-1', name: 'North' };
	const { context: organizationContext, calls: organizationCalls } = createContext(
		[{}],
		[{ body: [organization], headers: {} }],
	);
	const organizationResult = await getOrganizations.call(organizationContext, 'North');
	assert.equal(new URL(organizationCalls[0].url).pathname, '/api/Organizations');
	assert.deepEqual(organizationResult.results[0], { name: 'North (o-1)', value: 'o-1' });

	const site = { id: 's-1', name: 'North site' };
	const { context: globalContext, calls: globalCalls } = createContext(
		[{}],
		[{ body: [site], headers: {} }],
	);
	const globalResult = await getSites.call(globalContext, 'North');
	assert.equal(new URL(globalCalls[0].url).pathname, '/api/Sites');
	assert.deepEqual(globalResult.results[0], { name: 'North site (s-1)', value: 's-1' });

	const { context: scopedContext, calls: scopedCalls } = createContext(
		[{ organizationId: { mode: 'id', value: 'org/1' } }],
		[{ body: [site], headers: {} }],
	);
	await getSites.call(scopedContext, 'North');
	assert.equal(new URL(scopedCalls[0].url).pathname, '/api/Organizations/org%2F1/Sites');

	const nodeProperties = new Bdp().description.properties;
	const orgSelector = nodeProperties.find(
		({ name, displayOptions }) =>
			name === 'organizationId' && displayOptions?.show?.resource?.includes('site'),
	);
	const siteSelector = nodeProperties.find(({ name }) => name === 'siteId');
	const siteGetOrganizationSelector = nodeProperties.find(
		({ name, displayOptions }) =>
			name === 'organizationId' &&
			displayOptions?.show?.resource?.includes('site') &&
			displayOptions?.show?.operation?.includes('getById'),
	);
	const scope = nodeProperties.find(({ name, displayOptions }) => name === 'scope' && displayOptions?.show?.resource?.includes('site'));
	assert.ok(orgSelector && siteGetOrganizationSelector && siteSelector && scope);
	assert.equal(orgSelector.type, 'resourceLocator');
	assert.equal(siteGetOrganizationSelector.required, false);
	assert.equal(siteSelector.type, 'resourceLocator');
	assert.deepEqual(scope.options.map(({ value }) => value), ['all', 'organization']);
	assert.deepEqual(orgSelector.displayOptions.show.scope, ['organization']);
	assert.equal(orgSelector.modes[0].typeOptions.searchable, true);
	assert.equal(siteSelector.modes[0].typeOptions.searchable, true);
});

test('organization-scoped site lists retain per-input links and IDs', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'site', operation: 'getAll', scope: 'organization', organizationId: { mode: 'id', value: 'o-1' }, returnAll: false, limit: 1 },
			{ resource: 'site', operation: 'getAll', scope: 'organization', organizationId: { mode: 'id', value: 'o-2' }, returnAll: false, limit: 1 },
		],
		[
			{ body: [{ id: 's-1' }], headers: {} },
			{ body: [{ id: 's-2' }], headers: {} },
		],
		[{ json: { organizationId: 'o-1' } }, { json: { organizationId: 'o-2' } }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json, pairedItem }) => [json.id, pairedItem.item]), [
		['s-1', 0],
		['s-2', 1],
	]);
	assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
		'/api/Organizations/o-1/Sites',
		'/api/Organizations/o-2/Sites',
	]);
});
