const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { WRITE_ALLOWLIST } = require('../dist/nodes/Bdp/shared/writeAllowlist.js');
const { createContext } = require('./helpers.cjs');

// Every operation permitted to send POST, PATCH, PUT or DELETE, with an example request path.
// Adding a write operation means adding it here AND to nodes/Bdp/shared/writeAllowlist.ts;
// this test fails otherwise.
const EXPECTED_WRITES = [
	{ resource: 'measurementValue', operation: 'update', method: 'PATCH', path: '/api/MeasurementValues/m-1' },
	{ resource: 'measurementValue', operation: 'update', method: 'PATCH', path: '/api/DeviceGroups/g-1/MeasurementValues' },
	{ resource: 'dataSet', operation: 'create', method: 'POST', path: '/api/DataSets' },
	{ resource: 'dataSet', operation: 'update', method: 'PATCH', path: '/api/DataSets/ds-1' },
	{ resource: 'dataSet', operation: 'delete', method: 'DELETE', path: '/api/DataSets/ds-1' },
	{ resource: 'eventHub', operation: 'update', method: 'PATCH', path: '/api/EventHubs/eh-1' },
	{ resource: 'deviceGroup', operation: 'setOnDemand', method: 'POST', path: '/api/DeviceGroups/g-1/SetOnDemand' },
	{ resource: 'deviceGroup', operation: 'getOnDemand', method: 'POST', path: '/api/DeviceGroups/g-1/GetOnDemand' },
	{ resource: 'source', operation: 'runOnDemand', method: 'POST', path: '/api/Sources/s-1/OnDemand/Refresh' },
	{ resource: 'telemetry', operation: 'send', method: 'POST', path: '/devices/dev-1/messages/events' },
];

const matches = (spec, request) =>
	spec.resource === request.resource &&
	spec.operation === request.operation &&
	spec.method === request.method &&
	spec.path.test(request.path);

test('the write allowlist contains exactly the registered write operations', () => {
	assert.equal(WRITE_ALLOWLIST.length, EXPECTED_WRITES.length);
	for (const expected of EXPECTED_WRITES) {
		assert.equal(WRITE_ALLOWLIST.filter((spec) => matches(spec, expected)).length, 1, JSON.stringify(expected));
		// A longer or different path must not be covered by the same entry.
		for (const path of [expected.path + '/extra', expected.path + '?x=1', '/other' + expected.path]) {
			assert.ok(!WRITE_ALLOWLIST.some((spec) => matches(spec, { ...expected, path })), path);
		}
	}
	for (const spec of WRITE_ALLOWLIST) {
		assert.equal(EXPECTED_WRITES.filter((expected) => matches(spec, expected)).length, 1);
		assert.ok(['POST', 'PATCH', 'PUT', 'DELETE'].includes(spec.method));
		// Only PATCH replace may be retried; POST/DELETE are never idempotent here.
		if (spec.idempotent) assert.equal(spec.method, 'PATCH', 'only PATCH replace may be retryable');
	}
});

function nodeOperations() {
	const description = new Bdp().description;
	const resources = description.properties.find((p) => p.name === 'resource').options.map((o) => o.value);
	const result = [];
	for (const resource of resources) {
		const operationProperty = description.properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
		);
		for (const option of operationProperty.options) result.push({ resource, operation: option.value });
	}
	return result;
}

const ref = (value) => ({ mode: 'id', value });

test('only registered write operations can send non-GET requests (all resources, all operations)', async () => {
	const operations = nodeOperations();
	assert.ok(operations.length > 20, 'expected to enumerate every node operation');
	for (const { resource, operation } of operations) {
		const parameters = {
			resource,
			operation,
			buildingId: ref('b-1'),
			organizationId: ref('o-1'),
			siteId: ref('si-1'),
			floorId: ref('f-1'),
			spaceId: ref('sp-1'),
			sourceId: ref('s-1'),
			deviceId: ref('d-1'),
			deviceGroupId: ref('g-1'),
			dataSetId: ref('ds-1'),
			eventHubId: ref('e-1'),
			measurementId: ref('m-1'),
			query: '{ buildings { id } }',
			start: '2025-01-01T00:00:00Z',
			end: '2025-01-02T00:00:00Z',
			limit: 1,
		};
		const { context, calls } = createContext([parameters], [], [{ json: {} }], true);
		await new Bdp().execute.call(context);
		for (const call of calls) {
			if (call.method === 'GET') continue;
			const url = new URL(call.url);
			const graphqlQuery = resource === 'graphql' && call.method === 'POST' && url.pathname === '/graphql';
			const registered = WRITE_ALLOWLIST.some(
				(spec) => spec.resource === resource && spec.operation === operation && spec.method === call.method && spec.path.test(url.pathname),
			);
			assert.ok(
				graphqlQuery || registered,
				`${resource}.${operation} sent unregistered ${call.method} ${url.pathname}`,
			);
		}
		if (!WRITE_ALLOWLIST.some((spec) => spec.resource === resource && spec.operation === operation)) {
			for (const call of calls) {
				if (resource === 'graphql') continue;
				assert.equal(call.method, 'GET', `${resource}.${operation} is not a registered write`);
			}
		}
	}
});

test('the GraphQL resource stays read-only: mutations are rejected before any request', async () => {
	const { context, calls } = createContext(
		[{ resource: 'graphql', operation: 'executeQuery', query: 'mutation { updatePoint { id } }' }],
		[],
		[{ json: {} }],
		true,
	);
	const [output] = await new Bdp().execute.call(context);
	assert.match(output[0].json.error, /read-only/);
	assert.equal(calls.length, 0);
});

test('only the shared transport talks to the network', () => {
	const root = path.join(__dirname, '..', 'nodes');
	const offenders = [];
	(function scan(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) scan(full);
			else if (entry.name.endsWith('.ts') && !full.endsWith(path.join('shared', 'transport.ts'))) {
				if (/httpRequest(WithAuthentication)?\b/.test(fs.readFileSync(full, 'utf8'))) offenders.push(full);
			}
		}
	})(root);
	assert.deepEqual(offenders, []);
});
