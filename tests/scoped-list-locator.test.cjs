const assert = require('node:assert/strict');
const test = require('node:test');
const { fetchScopedList } = require('../dist/nodes/Bdp/shared/scopedList.js');
const { createListSearch, createResourceLocator } = require('../dist/nodes/Bdp/shared/locator.js');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { Workflow } = require('n8n-workflow');

const scopedOptions = {
	scope: 'site',
	scopePaths: { site: 'Sites', organization: 'Organizations' },
	parentId: 'site/one',
	child: 'Devices',
	filters: { name: 'Air', status: 'active' },
	orderBy: 'NameAscending',
	returnAll: true,
	limit: 100,
	pageSize: 2,
};

test('scoped lists map and encode parents while retaining filters and ordering across pages', async () => {
	const calls = [];
	const results = await fetchScopedList(async (path, qs) => {
		calls.push({ path, qs });
		return { data: qs.skip === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], headers: {} };
	}, scopedOptions);
	assert.deepEqual(results, [{ id: 1 }, { id: 2 }, { id: 3 }]);
	assert.deepEqual(calls, [
		{
			path: '/api/Sites/site%2Fone/Devices',
			qs: { name: 'Air', status: 'active', orderBy: 'NameAscending', take: 2, skip: 0 },
		},
		{
			path: '/api/Sites/site%2Fone/Devices',
			qs: { name: 'Air', status: 'active', orderBy: 'NameAscending', take: 2, skip: 2 },
		},
	]);
});

test('scoped lists respect limits, handle empty pages and reject invalid scope or parent', async () => {
	const calls = [];
	const request = async (path, qs) => {
		calls.push({ path, qs });
		return { data: [{ id: 1 }], headers: {} };
	};
	assert.deepEqual(
		await fetchScopedList(request, {
			...scopedOptions,
			scope: 'organization',
			returnAll: false,
			limit: 1,
		}),
		[{ id: 1 }],
	);
	assert.equal(calls[0].path, '/api/Organizations/site%2Fone/Devices');
	assert.equal(calls[0].qs.take, 1);
	assert.deepEqual(
		await fetchScopedList(async () => ({ data: [], headers: {} }), scopedOptions),
		[],
	);
	await assert.rejects(
		fetchScopedList(request, { ...scopedOptions, scope: 'toString' }),
		/Unsupported BDP scope/,
	);
	await assert.rejects(fetchScopedList(request, { ...scopedOptions, parentId: ' ' }), /parent ID/);
});

test('scoped lists propagate later-page failures without returning partial results', async () => {
	const failure = new Error('later page failed');
	await assert.rejects(
		fetchScopedList(async (_path, qs) => {
			if (qs.skip) throw failure;
			return { data: [{ id: 1 }, { id: 2 }], headers: {} };
		}, scopedOptions),
		(error) => error === failure,
	);
});

function searchContext(parent, pages) {
	const calls = [];
	return {
		calls,
		context: {
			getNode: () => ({ name: 'Test' }),
			getNodeParameter: () => parent,
			getCredentials: async () => ({ environment: 'uat' }),
			helpers: {
				httpRequestWithAuthentication: async (_credential, options) => {
					calls.push(options);
					return { body: pages.shift(), headers: {} };
				},
			},
		},
	};
}

test('locator factory supports searchable list and expression-capable manual ID modes', () => {
	const locator = createResourceLocator({
		displayName: 'Site',
		name: 'siteId',
		searchMethod: 'searchSites',
		listPlaceholder: 'Select a site...',
		idPlaceholder: 'Enter a site ID',
		displayOptions: { show: { resource: ['site'] } },
	});
	assert.deepEqual(locator.default, { mode: 'list', value: '' });
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'searchSites');
	assert.equal(locator.modes[1].type, 'string');
	assert.notEqual(locator.noDataExpression, true);
	assert.notEqual(locator.modes[1].noDataExpression, true);
});

test('a locator ID expression resolves for each execution input', async () => {
	const node = {
		name: 'BDP',
		type: 'n8n-nodes-bdp.bdp',
		typeVersion: 1,
		position: [0, 0],
		parameters: {
			resource: 'building',
			operation: 'getById',
			buildingId: { mode: 'id', value: '={{ $json.id }}' },
		},
	};
	const workflow = new Workflow({
		nodes: [node],
		connections: {},
		active: false,
		nodeTypes: { getByNameAndVersion: () => new Bdp() },
	});
	const items = [{ json: { id: 'b/1' } }, { json: { id: 'b/2' } }];
	const { context, calls } = searchContext(undefined, [{ id: 'b/1' }, { id: 'b/2' }]);
	context.getInputData = () => items;
	context.continueOnFail = () => false;
	context.getNodeParameter = (name, index, fallback, options) => {
		const parameter = node.parameters[name] ?? fallback;
		const value = options?.extractValue ? parameter.value : parameter;
		return workflow.expression.getParameterValue(
			value,
			null,
			0,
			index,
			node.name,
			items,
			'internal',
			{},
		);
	};
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(
		output.map(({ json }) => json.id),
		['b/1', 'b/2'],
	);
	assert.ok(calls[0].url.endsWith('/api/Buildings/b%2F1'));
	assert.ok(calls[1].url.endsWith('/api/Buildings/b%2F2'));
});

test('n8n retains the selected building list and locator scopes and their parent IDs', () => {
	for (const parameters of [
		{ resource: 'building', operation: 'getAll', scope: 'organization', organizationId: { mode: 'id', value: 'o-1' } },
		{ resource: 'building', operation: 'getAll', scope: 'site', siteId: { mode: 'id', value: 's-1' } },
		{ resource: 'building', operation: 'getById', buildingSearchScope: 'site', siteId: { mode: 'id', value: 's-1' }, buildingId: { mode: 'id', value: 'b-1' } },
		{ resource: 'measurementValue', operation: 'getAll', buildingSearchScope: 'organization', organizationId: { mode: 'id', value: 'o-1' }, buildingId: { mode: 'id', value: 'b-1' } },
	]) {
		const node = { name: 'BDP', type: 'n8n-nodes-bdp.bdp', typeVersion: 1, position: [0, 0], parameters };
		const workflow = new Workflow({
			nodes: [node], connections: {}, active: false,
			nodeTypes: { getByNameAndVersion: () => new Bdp() },
		});
		for (const [key, value] of Object.entries(parameters)) {
			assert.deepEqual(workflow.nodes.BDP.parameters[key], value, `${parameters.resource} ${parameters.operation}: ${key}`);
		}
	}
});

test('list search paginates names and IDs under a resolved parent', async () => {
	const search = createListSearch({
		path: 'Sites',
		label: 'Site',
		invalidResponseMessage: 'Invalid site response.',
		parent: { path: 'Organizations', parameter: 'organizationId', label: 'organization' },
	});
	const records = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, name: i ? null : 'North' }));
	const { context, calls } = searchContext('org/1', [records, [{ id: 's50', name: 'South' }]]);
	const first = await search.call(context, 'North');
	const second = await search.call(context, 'North', first.paginationToken);
	assert.deepEqual(first.results[0], { name: 'North (s0)', value: 's0' });
	assert.deepEqual(first.results[1], { name: 'Site s1', value: 's1' });
	assert.equal(first.paginationToken, '50');
	assert.equal(second.paginationToken, undefined);
	assert.equal(calls[0].url.endsWith('/api/Organizations/org%2F1/Sites'), true);
	assert.deepEqual(
		calls.map(({ qs }) => qs),
		[
			{ take: 50, skip: 0, name: 'North' },
			{ take: 50, skip: 50, name: 'North' },
		],
	);
});

test('list search rejects unresolved parent expressions and invalid pagination without a request', async () => {
	const search = createListSearch({
		path: 'Sites',
		label: 'Site',
		invalidResponseMessage: 'Invalid site response.',
		parent: { path: 'Organizations', parameter: 'organizationId', label: 'organization' },
	});
	for (const parent of ['', '={{ $json.organizationId }}', undefined]) {
		const { context, calls } = searchContext(parent, []);
		await assert.rejects(search.call(context), /resolved organization ID/);
		assert.equal(calls.length, 0);
	}
	const { context, calls } = searchContext('org1', []);
	await assert.rejects(search.call(context, undefined, '-1'), /pagination token/);
	assert.equal(calls.length, 0);
});

test('optional list-search parents use the collection endpoint unless a resolved parent is selected', async () => {
	const search = createListSearch({
		path: 'Sites',
		label: 'Site',
		invalidResponseMessage: 'Invalid site response.',
		parent: {
			path: 'Organizations',
			parameter: 'organizationId',
			label: 'organization',
			optional: true,
		},
	});
	const { context: globalContext, calls: globalCalls } = searchContext('', [[]]);
	await search.call(globalContext);
	assert.equal(globalCalls[0].url.endsWith('/api/Sites'), true);

	const { context: unresolvedContext, calls: unresolvedCalls } = searchContext('={{ $json.orgId }}', []);
	await assert.rejects(search.call(unresolvedContext), /resolved organization ID/);
	assert.equal(unresolvedCalls.length, 0);
});
