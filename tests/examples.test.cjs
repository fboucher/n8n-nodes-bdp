const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Expression } = require('n8n-workflow');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { createContext, paths } = require('./helpers.cjs');

const expression = new Expression('UTC');

for (const filename of [
	'buildings-floors-spaces.json',
	'building-history-three-days.json',
	'building-history.json',
	'phase-one-scheduled-extraction.json',
]) {
	test(`${filename} has equivalent local and npm workflows`, () => {
		const load = (variant) =>
			JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', variant, filename), 'utf8'));
		const local = load('local');
		const npm = load('npm');
		const localNodes = local.nodes.filter(({ type }) => type === 'CUSTOM.bdp');
		const npmNodes = npm.nodes.filter(({ type }) => type === 'n8n-nodes-bdp.bdp');
		assert.ok(localNodes.length > 0);
		assert.equal(localNodes.length, npmNodes.length);
		for (const node of localNodes) node.type = 'n8n-nodes-bdp.bdp';
		assert.deepEqual(local, npm);
	});
}

test('building hierarchy example lists floors and spaces for every building with linked output', async () => {
	const workflow = require('../examples/npm/buildings-floors-spaces.json');
	const node = (name) => workflow.nodes.find((entry) => entry.name === name);
	assert.equal(workflow.active, false);
	for (const [source, target] of [
		['Run Manually', 'List Buildings'],
		['List Buildings', 'List Floors'],
	]) {
		assert.equal(workflow.connections[source].main[0][0].node, target);
	}
	assert.equal(workflow.connections['List Buildings'].main[0][1].node, 'List Spaces');

	const run = async (name, inputs, responses, locator) => {
		const parameters = node(name).parameters;
		const perItem = inputs.map(({ json }) => ({
			...parameters,
			...(locator && {
				[locator]: {
					...parameters[locator],
					value: expression.resolveSimpleParameterValue(parameters[locator].value, { $json: json }),
				},
			}),
		}));
		const { context, calls } = createContext(perItem, responses, inputs);
		const [output] = await new Bdp().execute.call(context);
		return { output, calls };
	};
	const page = (body, total = body.length) => ({ body, headers: { 'x-total-count': String(total) } });
	const buildings = await run('List Buildings', [{ json: {} }], [
		page([{ id: 'b-1' }], 3), page([{ id: 'b-2' }, { id: 'b-3' }], 3),
	]);
	const floors = await run('List Floors', buildings.output, [
		page([{ id: 'f-1' }, { id: 'f-2' }]), page([{ id: 'f-3' }]), page([]),
	], 'buildingId');
	const spaces = await run('List Spaces', buildings.output, [
		page([{ id: 's-1' }]), page([]), page([{ id: 's-2' }]),
	], 'buildingId');

	assert.equal(node('List Buildings').parameters.returnAllBuildings, true);
	assert.equal(node('List Floors').parameters.returnAll, true);
	assert.equal(node('List Spaces').parameters.returnAll, true);
	assert.deepEqual(buildings.calls.map(({ qs }) => qs.skip), [0, 1]);
	assert.deepEqual(paths(floors.calls), ['/api/Buildings/b-1/Floors', '/api/Buildings/b-2/Floors', '/api/Buildings/b-3/Floors']);
	assert.deepEqual(paths(spaces.calls), ['/api/Buildings/b-1/Spaces', '/api/Buildings/b-2/Spaces', '/api/Buildings/b-3/Spaces']);
	assert.deepEqual(floors.output.map(({ pairedItem }) => pairedItem.item), [0, 0, 1]);
	assert.deepEqual(spaces.output.map(({ json, pairedItem }) => [json.id, pairedItem.item]), [['s-1', 0], ['s-2', 2]]);
});

test('three-day history example resolves its window and requests all building history pages', async () => {
	const workflow = require('../examples/npm/building-history-three-days.json');
	const node = workflow.nodes.find((entry) => entry.name === 'Read Building History');
	assert.equal(workflow.active, false);
	assert.equal(workflow.connections['Run Manually'].main[0][0].node, node.name);
	assert.deepEqual(node.parameters.buildingId, { __rl: true, mode: 'list', value: '' });
	const date = (milliseconds) => ({
		minus: ({ days }) => date(milliseconds - days * 24 * 60 * 60 * 1000),
		toUTC: () => date(milliseconds),
		toISO: () => new Date(milliseconds).toISOString(),
	});
	const $now = date(Date.parse('2025-01-04T12:00:00Z'));
	const parameters = {
		...node.parameters,
		buildingId: { ...node.parameters.buildingId, value: 'b-1' },
		start: expression.resolveSimpleParameterValue(node.parameters.start, { $now }),
		end: expression.resolveSimpleParameterValue(node.parameters.end, { $now }),
	};
	const { context, calls } = createContext([parameters], [
		{ body: [{ value: 1 }], headers: { 'x-total-count': '2' } },
		{ body: [{ value: 2 }], headers: { 'x-total-count': '2' } },
	]);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(paths(calls), ['/api/Buildings/b-1/HistoricalValues', '/api/Buildings/b-1/HistoricalValues']);
	assert.deepEqual(calls.map(({ qs }) => [qs.from, qs.to, qs.skip]), [
		['2025-01-01T12:00:00.000Z', '2025-01-04T12:00:00.000Z', 0],
		['2025-01-01T12:00:00.000Z', '2025-01-04T12:00:00.000Z', 1],
	]);
	assert.deepEqual(output.map(({ json }) => json.value), [1, 2]);
});

for (const [filename, resource, idParameter, mode] of [
	['building-history.json', 'building', 'buildingId', 'list'],
	['phase-one-scheduled-extraction.json', 'measurementValue', 'measurementId', 'id'],
]) {
	test(`${filename} uses the current read-only history operation and credential`, () => {
		const workflow = JSON.parse(
			fs.readFileSync(path.join(__dirname, '..', 'examples', 'npm', filename), 'utf8'),
		);
		assert.equal(workflow.active, false);
		const names = new Set(workflow.nodes.map((node) => node.name));
		assert.equal(names.size, workflow.nodes.length);
		for (const [source, outputs] of Object.entries(workflow.connections)) {
			assert.ok(names.has(source));
			for (const links of outputs.main) for (const link of links) assert.ok(names.has(link.node));
		}

		const bdpNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-bdp.bdp');
		assert.ok(bdpNode);
		assert.equal(bdpNode.parameters.resource, resource);
		assert.equal(bdpNode.parameters.operation, 'getHistorical');
		assert.equal(bdpNode.parameters[idParameter].mode, mode);
		assert.equal(bdpNode.parameters[idParameter].value, '');
		assert.match(bdpNode.parameters.start, /^={{\$now\.minus\(\{days: 1\}\)\.toISO\(\)}}$/);
		assert.match(bdpNode.parameters.end, /^={{\$now\.toISO\(\)}}$/);
		assert.equal(bdpNode.parameters.returnAll, true);
		assert.equal(bdpNode.credentials, undefined);

		const properties = new Bdp().description.properties;
		const resourceProperty = properties.find((property) => property.name === 'resource');
		assert.ok(resourceProperty.options.some((option) => option.value === resource));
		const operationProperty = properties.find(
			(property) =>
				property.name === 'operation' &&
				property.displayOptions.show.resource.includes(resource),
		);
		assert.ok(operationProperty.options.some((option) => option.value === 'getHistorical'));
		assert.equal(new Bdp().description.credentials[0].name, 'bdpOAuth2Api');
	});
}
