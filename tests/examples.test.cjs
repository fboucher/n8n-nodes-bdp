const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { prepareGraphqlRequest } = require('../dist/nodes/Bdp/shared/graphql.js');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');

for (const filename of ['graphql-nested-query.json', 'graphql-two-pages.json']) {
	test(`${filename} is an importable synthetic workflow with valid connections and query selection`, () => {
		const workflow = JSON.parse(
			fs.readFileSync(path.join(__dirname, '..', 'examples', filename), 'utf8'),
		);
		assert.equal(workflow.active, false);
		const names = new Set(workflow.nodes.map((node) => node.name));
		assert.equal(names.size, workflow.nodes.length);
		for (const [source, outputs] of Object.entries(workflow.connections)) {
			assert.ok(names.has(source));
			for (const links of outputs.main) for (const link of links) assert.ok(names.has(link.node));
		}
		for (const node of workflow.nodes.filter((node) => node.type === 'n8n-nodes-bdp.bdp')) {
			assert.equal(node.credentials, undefined);
			assert.equal(node.parameters.resource, 'graphql');
			assert.equal(node.parameters.operation, 'executeQuery');
			const variables = node.parameters.variables.startsWith('=')
				? { take: 2, skip: 0 }
				: node.parameters.variables;
			prepareGraphqlRequest(node.parameters.query, variables, node.parameters.operationName);
		}
	});
}

test('two-page workflow sends exactly the displayed page variables, preserves envelopes and returns to the loop', async () => {
	const workflow = require('../examples/graphql-two-pages.json');
	const inputNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code');
	const inputs = new Function(inputNode.parameters.jsCode)();
	assert.deepEqual(inputs, [{ json: { take: 2, skip: 0 } }, { json: { take: 2, skip: 2 } }]);
	const queryNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-bdp.bdp');
	const calls = [];
	const context = {
		getNode: () => queryNode,
		getInputData: () => inputs,
		getNodeParameter: (name, index, fallback) =>
			name === 'variables' ? inputs[index].json : (queryNode.parameters[name] ?? fallback),
		getCredentials: async () => ({ environment: 'uat' }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (_type, options) => {
				calls.push(options);
				return { body: { data: { page: [] } }, headers: {} };
			},
		},
	};
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(
		calls.map(({ body }) => body.variables),
		inputs.map(({ json }) => json),
	);
	assert.equal(output.length, 2);
	assert.deepEqual(
		output.map(({ json }) => json),
		[{ data: { page: [] } }, { data: { page: [] } }],
	);
	assert.equal(workflow.connections['Loop Over Pages'].main[1][0].node, 'Read One Page');
	assert.equal(workflow.connections['Process Full Envelope'].main[0][0].node, 'Loop Over Pages');
});
