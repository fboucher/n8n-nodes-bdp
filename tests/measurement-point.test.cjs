const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getMeasurementValues } = require('../dist/nodes/Bdp/resources/measurementPoint/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const id = (value, mode = 'id') => ({ mode, value });
const scopes = [
	['building', 'buildingId', '/api/Buildings/p%2F1/MeasurementValues'],
	['floor', 'floorId', '/api/Floors/p%2F1/MeasurementValues'],
	['space', 'spaceId', '/api/Spaces/p%2F1/MeasurementValues'],
	['device', 'deviceId', '/api/Devices/p%2F1/MeasurementValues'],
	['deviceGroup', 'deviceGroupId', '/api/DeviceGroups/p%2F1/MeasurementValues'],
	['dataSet', 'dataSetId', '/api/DataSets/p%2F1/MeasurementValues'],
];

test('Measurement Point List without a scope keeps the building request and output unchanged', async () => {
	const point = { id: 'm-1', value: 21.5, writeable: false };
	const { context, calls } = createContext(
		[{ resource: 'measurementValue', operation: 'getAll', buildingId: id('b/1'), name: 'Temp', ontologyType: 'Sensor', unit: 'C', limit: 100 }],
		[{ body: [point], headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: point, pairedItem: { item: 0 } }]);
	assert.deepEqual(paths(calls), ['/api/Buildings/b%2F1/MeasurementValues']);
	assert.deepEqual(calls[0].qs, { name: 'Temp', ontologyType: 'Sensor', unit: 'C', take: 100, skip: 0 });
});

test('Measurement Point List uses the route for every scope with links and native types', async () => {
	const { context, calls } = createContext(
		scopes.map(([measurementScope, parameter]) => ({
			resource: 'measurementValue', operation: 'getAll', measurementScope, [parameter]: id('p/1', 'list'), limit: 1,
		})),
		scopes.map((_, i) => ({ body: [{ id: `m-${i}`, value: i % 2 ? null : i }], headers: { 'x-total-count': '9' } })),
		scopes.map(() => ({ json: {} })),
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json, pairedItem }) => [json.id, json.value, pairedItem.item]),
		scopes.map((_, i) => [`m-${i}`, i % 2 ? null : i, i]));
	assert.deepEqual(paths(calls), scopes.map(([, , path]) => path));
	for (const { qs } of calls) assert.deepEqual(qs, { take: 1, skip: 0 });
});

test('Measurement Point List sends each new filter and normalizes updatedAfter to UTC', async () => {
	const { context, calls } = createContext(
		[{
			resource: 'measurementValue', operation: 'getAll', buildingId: id('b-1'), returnAll: true,
			referenceId: 'ref', metadata: 'k=v', context: 'ctx', isWriteable: 'true', commissionedStatus: 'Decommissioned',
			orderBy: 'NameAscending', updatedAfter: '2025-03-01T02:00:00+02:00',
		}],
		[{ body: [{ id: 'm-1' }], headers: { 'x-total-count': '2' } }, { body: [{ id: 'm-2' }], headers: { 'x-total-count': '2' } }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.id), ['m-1', 'm-2']);
	const filters = {
		referenceId: 'ref', metadata: 'k=v', context: 'ctx', isWriteable: true, commissionedStatus: 'Decommissioned',
		orderBy: 'NameAscending', updatedAfter: '2025-03-01T00:00:00.000Z',
	};
	assert.deepEqual(calls.map(({ qs }) => qs), [{ ...filters, take: 5000, skip: 0 }, { ...filters, take: 5000, skip: 1 }]);
});

test('Measurement Point isWriteable can request read-only points and unset options are not sent', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'measurementValue', operation: 'getAll', buildingId: id('b-1'), isWriteable: 'false', limit: 5 },
			{ resource: 'measurementValue', operation: 'getAll', buildingId: id('b-1'), isWriteable: '', commissionedStatus: '', updatedAfter: '', referenceId: '', limit: 5 },
		],
		[{ body: [], headers: {} }, { body: [], headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].qs, { isWriteable: false, take: 5, skip: 0 });
	assert.deepEqual(calls[1].qs, { take: 5, skip: 0 });
});

test('Measurement Point List rejects an invalid updatedAfter without a request', async () => {
	for (const [value, message] of [
		['2025-03-01', /Updated After must be an ISO 8601 timestamp/],
		['2025-03-01T00:00:00', /explicit UTC offset/],
		['2025-02-30T00:00:00Z', /Updated After is not a valid/],
	]) {
		const { context, calls } = createContext(
			[{ resource: 'measurementValue', operation: 'getAll', buildingId: id('b-1'), updatedAfter: value }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Measurement Point Get returns one native record by selected or manual ID', async () => {
	for (const mode of ['list', 'id']) {
		const point = { id: 'm/1', value: null, metadata: { a: null } };
		const { context, calls } = createContext(
			[{ resource: 'measurementValue', operation: 'getById', measurementId: id('m/1', mode) }],
			[{ body: point, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: point, pairedItem: { item: 0 } }]]);
		assert.deepEqual(paths(calls), ['/api/MeasurementValues/m%2F1']);
		assert.equal(calls[0].method, 'GET');
	}
});

test('Measurement Point operations reject missing inputs and invalid limits without requests', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getAll' }, /Building ID is required/],
		...scopes.slice(1).map(([measurementScope, , ]) => [{ operation: 'getAll', measurementScope }, /ID is required/]),
		[{ operation: 'getAll', measurementScope: 'floor', buildingId: id('b-1') }, /Floor ID is required/],
		[{ operation: 'getAll', measurementScope: 'dataSet', dataSetId: id(' ') }, /Data Set ID is required/],
		[{ operation: 'getAll', measurementScope: 'site', buildingId: id('b-1') }, /supported measurement-point scope/],
		[{ operation: 'getAll', buildingId: id('b-1'), limit: 0 }, /positive whole number/],
		[{ operation: 'getById' }, /Measurement point ID is required/],
		[{ operation: 'getById', measurementId: id(' ') }, /Measurement point ID is required/],
	]) {
		const { context, calls } = createContext([{ resource: 'measurementValue', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Measurement Point operations reject malformed responses and propagate safe API errors', async () => {
	const parameters = (operation) => ({ resource: 'measurementValue', operation, buildingId: id('b-1'), measurementId: id('m-1') });
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid measurement-point detail response/],
		['getById', null, /invalid measurement-point detail response/],
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

test('Measurement Point Historical Values is unchanged by scopes', async () => {
	const { context, calls } = createContext(
		[{
			resource: 'measurementValue', operation: 'getHistorical', measurementScope: 'device', deviceId: id('d-1'),
			measurementId: id('m-1'), start: '2025-01-01T01:00:00+01:00', end: '2025-01-02T00:00:00Z', limit: 100,
		}],
		[{ body: [{ measurementValueId: 'm-1', value: 1 }], headers: {} }],
	);
	await new Bdp().execute.call(context);
	assert.deepEqual(paths(calls), ['/api/MeasurementValue/m-1/HistoricalValues']);
	assert.equal(calls[0].qs.from, '2025-01-01T00:00:00.000Z');
});

test('Measurement Point locator follows the selected scope and defaults to the building', async () => {
	const parameters = {
		buildingId: id('p/1'), floorId: id('p/1'), spaceId: id('p/1'), deviceId: id('p/1'), deviceGroupId: id('p/1'), dataSetId: id('p/1'),
	};
	const { context, calls } = createContext([parameters], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `m-${i}`, name: i ? null : 'Temp' })), headers: {} },
		{ body: [], headers: {} },
		...scopes.slice(1).map(() => ({ body: [], headers: {} })),
	]);
	const first = await getMeasurementValues.call(context, 'Te');
	assert.deepEqual(first.results[0], { name: 'Temp (m-0)', value: 'm-0' });
	assert.deepEqual(first.results[1], { name: 'Measurement point m-1', value: 'm-1' });
	assert.equal(first.paginationToken, '50');
	assert.equal((await getMeasurementValues.call(context, 'Te', first.paginationToken)).paginationToken, undefined);
	for (const [scope] of scopes.slice(1)) {
		parameters.measurementScope = scope;
		await getMeasurementValues.call(context, 'x');
	}
	assert.deepEqual(paths(calls), [scopes[0][2], scopes[0][2], ...scopes.slice(1).map(([, , path]) => path)]);
	assert.deepEqual(calls[1].qs, { take: 50, skip: 50, name: 'Te' });
});

test('Measurement Point locator rejects missing parents, bad scope, tokens, bad responses and API errors', async () => {
	for (const [measurementScope, parameter, label] of [
		['building', 'buildingId', 'building'], ['floor', 'floorId', 'floor'], ['space', 'spaceId', 'space'],
		['device', 'deviceId', 'device'], ['deviceGroup', 'deviceGroupId', 'device group'], ['dataSet', 'dataSetId', 'data set'],
	]) {
		for (const value of ['', ' ', '={{ $json.id }}']) {
			const { context, calls } = createContext([{ measurementScope, [parameter]: id(value) }], []);
			await assert.rejects(getMeasurementValues.call(context), new RegExp(`resolved ${label} ID`));
			assert.equal(calls.length, 0);
		}
	}
	const base = { measurementScope: 'device', deviceId: id('d-1') };
	await assert.rejects(getMeasurementValues.call(createContext([{ ...base, measurementScope: 'x' }], []).context), /supported measurement-point scope/);
	await assert.rejects(getMeasurementValues.call(createContext([base], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getMeasurementValues.call(createContext([base], [{ body: {}, headers: {} }]).context), /invalid measurement-point search response/);
	await assert.rejects(getMeasurementValues.call(createContext([base], [errorWithStatus(403)]).context), /denied access/);
});

test('Measurement Point properties default to the building and show only the selected scope\'s parent', () => {
	const props = new Bdp().description.properties;
	const scope = props.find((p) => p.name === 'measurementScope' && p.displayOptions.show.operation.includes('getAll'));
	assert.equal(scope.default, 'building');
	assert.deepEqual(scope.options.map(({ value }) => value), scopes.map(([value]) => value));
	const selectScope = props.find((p) => p.name === 'measurementScope' && p.displayOptions.show.operation.includes('getById'));
	assert.equal(selectScope.default, 'building');
	assert.deepEqual(selectScope.displayOptions.show.operation, ['getById', 'getHistorical']);
	const shownFor = (name, operation, measurementScope) =>
		props.some((p) => {
			const show = p.displayOptions?.show ?? {};
			return p.name === name && show.resource?.includes('measurementValue') && show.operation?.includes(operation) &&
				(!show.measurementScope || show.measurementScope.includes(measurementScope));
		});
	for (const operation of ['getAll', 'getById', 'getHistorical']) {
		for (const [measurementScope, parameter] of scopes) {
			assert.ok(shownFor(parameter, operation, measurementScope), `${operation} ${measurementScope} shows ${parameter}`);
		}
		assert.ok(!shownFor('floorId', operation, 'building') || false);
		assert.ok(!shownFor('dataSetId', operation, 'floor'));
		assert.ok(!shownFor('deviceGroupId', operation, 'dataSet'));
	}
	const listParent = (name, measurementScope) => props.find((p) => p.name === name &&
		p.displayOptions.show.resource.includes('measurementValue') && p.displayOptions.show.operation.includes('getAll') &&
		p.displayOptions.show.measurementScope?.includes(measurementScope));
	for (const [measurementScope, parameter] of scopes.slice(1)) {
		assert.equal(listParent(parameter, measurementScope).required, true, `${parameter} required for List`);
	}
	const locator = props.find((p) => p.name === 'measurementId');
	assert.deepEqual(locator.displayOptions.show.operation, ['getById', 'getHistorical']);
	assert.ok(locator.typeOptions.loadOptionsDependsOn.includes('measurementScope'));
	for (const name of ['isWriteable', 'metadata', 'referenceId', 'updatedAfter', 'context', 'commissionedStatus', 'orderBy']) {
		assert.ok(props.some((p) => p.name === name && p.displayOptions?.show?.resource?.includes('measurementValue')), name);
	}
	assert.equal(props.find((p) => p.name === 'commissionedStatus' && p.displayOptions.show.resource.includes('measurementValue')).type, 'options');
});
