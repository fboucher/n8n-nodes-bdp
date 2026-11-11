import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { getBuildings } from './listSearch/getBuildings';
import { getOrganizations } from './listSearch/getOrganizations';
import { getSites } from './listSearch/getSites';
import { getMeasurementValues } from './listSearch/getMeasurementValues';
import { normalizeWindow } from './shared/time';
import { fetchAllPages, getBdpRequest, requestBdpGraphql } from './shared/transport';

const buildingResource: INodeProperties = {
	displayName: 'Building',
	name: 'buildingId',
	type: 'resourceLocator' as const,
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: {
		show: {
			operation: ['getById', 'getHistorical'],
			resource: ['building'],
		},
	},
	modes: [
		{
			displayName: 'From list',
			name: 'list',
			type: 'list',
			placeholder: 'Select a building...',
			typeOptions: { searchListMethod: 'getBuildings', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'Enter a building ID',
		},
	],
};

function scopeLocator(
	displayName: string,
	name: string,
	method: string,
	scope: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'resourceLocator' as const,
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: { resource: ['building'], operation: ['getAll'], buildingScope: [scope] } },
		modes: [
			{
				displayName: 'From list',
				name: 'list',
				type: 'list',
				placeholder: `Select ${displayName.toLowerCase()}...`,
				typeOptions: { searchListMethod: method, searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: `Enter ${displayName.toLowerCase()} ID`,
			},
		],
	};
}

const buildingScopeProperties: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'buildingScope',
		type: 'options',
		default: 'all',
		displayOptions: { show: { resource: ['building'], operation: ['getAll'] } },
		options: [
			{ name: 'All Accessible', value: 'all' },
			{ name: 'Within Organization', value: 'organization' },
			{ name: 'Within Site', value: 'site' },
		],
		description: 'Which buildings to list',
	},
	scopeLocator('Organization', 'organizationId', 'getOrganizations', 'organization'),
	scopeLocator('Site', 'siteId', 'getSites', 'site'),
	{
		displayName: 'Additional Filters',
		name: 'buildingFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['building'], operation: ['getAll'] } },
		options: [
			{ displayName: 'Floor Count', name: 'floorCount', type: 'number', default: 0, description: 'Filter by number of floors' },
			{ displayName: 'Include Counts', name: 'includeCounts', type: 'boolean', default: true, description: 'Whether to include floor, space and measurement counts' },
			{ displayName: 'Measurement Count', name: 'measurementCount', type: 'number', default: 0, description: 'Filter by number of measurements' },
			{ displayName: 'Metadata', name: 'metadata', type: 'string', default: '', description: 'Filter by metadata' },
			{ displayName: 'Order By', name: 'orderBy', type: 'string', default: '', description: 'Sort order accepted by BDP' },
			{ displayName: 'Reference ID', name: 'referenceId', type: 'string', default: '', description: 'Filter by reference ID' },
			{ displayName: 'Space Count', name: 'spaceCount', type: 'number', default: 0, description: 'Filter by number of spaces' },
		],
	},
	{
		displayName: 'Options',
		name: 'buildingGetOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['building'], operation: ['getById'] } },
		options: [
			{ displayName: 'Include Counts', name: 'includeCounts', type: 'boolean', default: true, description: 'Whether to include floor, space and measurement counts' },
		],
	},
	{
		displayName: 'Building Picker Scope',
		name: 'locatorScope',
		type: 'collection',
		placeholder: 'Add Scope',
		default: {},
		displayOptions: { show: { resource: ['building', 'measurementValue'], operation: ['getById', 'getAll', 'getHistorical'] } },
		description: 'Optionally narrow the building "From list" picker to an organization or site',
		options: [
			{ displayName: 'Organization ID', name: 'organizationId', type: 'string', default: '' },
			{ displayName: 'Site ID', name: 'siteId', type: 'string', default: '' },
		],
	},
];

const measurementBuildingResource: INodeProperties = {
	...buildingResource,
	required: false,
	displayOptions: {
		show: {
			operation: ['getAll', 'getHistorical'],
			resource: ['measurementValue'],
		},
	},
};

const measurementResource: INodeProperties = {
	displayName: 'Measurement Point',
	name: 'measurementId',
	type: 'resourceLocator' as const,
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: {
		show: {
			operation: ['getHistorical'],
			resource: ['measurementValue'],
		},
	},
	modes: [
		{
			displayName: 'From list',
			name: 'list',
			type: 'list',
			placeholder: 'Select a measurement point...',
			typeOptions: { searchListMethod: 'getMeasurementValues', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'Enter a measurement point ID',
		},
	],
};

const paginationProperties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAllBuildings',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['building'],
				operation: ['getAll'],
			},
		},
		description: 'Whether to return every accessible building across all pages',
	},
	{
		displayName: 'Limit',
		name: 'buildingLimit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 100,
		displayOptions: {
			show: {
				resource: ['building'],
				operation: ['getAll'],
				returnAllBuildings: [false],
			},
		},
		description: 'Max number of buildings to return when Return All is disabled',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['measurementValue', 'building'],
				operation: ['getAll', 'getHistorical'],
			},
			hide: {
				resource: ['building'],
				operation: ['getAll'],
			},
		},
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		// BDP's agreed default is 100, rather than the generic n8n default.
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit
		default: 100,
		displayOptions: {
			show: {
				resource: ['measurementValue', 'building'],
				operation: ['getAll', 'getHistorical'],
				returnAll: [false],
			},
			hide: {
				resource: ['building'],
				operation: ['getAll'],
			},
		},
		description: 'Max number of results to return',
	},
];

const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Building', value: 'building' },
			{ name: 'GraphQL', value: 'graphql' },
			{ name: 'Measurement Point', value: 'measurementValue' },
		],
		default: 'building',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['building'] } },
		options: [
			// Keep the familiar List label while retaining the getAll operation ID.
			// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
			{ name: 'List', value: 'getAll', action: 'List buildings' },
			{ name: 'Get', value: 'getById', action: 'Get a building' },
			{ name: 'Historical Values', value: 'getHistorical', action: 'Get building history' },
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['measurementValue'] } },
		options: [
			{ name: 'Get Many', value: 'getAll', action: 'List measurement points' },
			{
				name: 'Historical Values',
				value: 'getHistorical',
				action: 'Get measurement point history',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['graphql'] } },
		options: [
			{ name: 'Execute Query', value: 'executeQuery', action: 'Execute a read only query' },
		],
		default: 'executeQuery',
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 10 },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['graphql'], operation: ['executeQuery'] } },
		description:
			'Read-only GraphQL document. Every operation must be a query; pagination is controlled by your document.',
	},
	{
		displayName: 'Variables',
		name: 'variables',
		type: 'json',
		default: '{}',
		displayOptions: { show: { resource: ['graphql'], operation: ['executeQuery'] } },
		description:
			'JSON object of variables, or an expression returning an object. Native JSON value types are preserved.',
	},
	{
		displayName: 'Operation Name',
		name: 'operationName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['graphql'], operation: ['executeQuery'] } },
		description: 'Named query to execute. Required when the document contains multiple queries.',
	},
	...buildingScopeProperties,
	buildingResource,
	measurementBuildingResource,
	measurementResource,
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['building', 'measurementValue'],
				operation: ['getAll'],
			},
		},
		description: 'Filter results by a name substring',
	},
	{
		displayName: 'Ontology Type',
		name: 'ontologyType',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['measurementValue'], operation: ['getAll'] },
		},
		description: 'Filter measurement points by ontology type',
	},
	{
		displayName: 'Unit',
		name: 'unit',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['measurementValue'], operation: ['getAll'] },
		},
		description: 'Filter measurement points by unit',
	},
	{
		displayName: 'Start',
		name: 'start',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2025-01-01T00:00:00Z',
		displayOptions: {
			show: { operation: ['getHistorical'] },
		},
		description: 'Inclusive or exclusive boundary behavior is defined by BDP',
	},
	{
		displayName: 'End',
		name: 'end',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2025-01-02T00:00:00Z',
		displayOptions: {
			show: { operation: ['getHistorical'] },
		},
		description: 'The end of the requested historical window',
	},
	...paginationProperties,
];

async function executeOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const resource = context.getNodeParameter('resource', itemIndex) as string;
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	if (resource === 'graphql' && operation === 'executeQuery') {
		return [
			await requestBdpGraphql.call(
				context,
				context.getNodeParameter('query', itemIndex),
				context.getNodeParameter('variables', itemIndex, '{}'),
				context.getNodeParameter('operationName', itemIndex, ''),
			),
		];
	}
	const isBuildingList = resource === 'building' && operation === 'getAll';
	const returnAll = isBuildingList
		? (context.getNodeParameter('returnAllBuildings', itemIndex, true) as boolean)
		: (context.getNodeParameter('returnAll', itemIndex, false) as boolean);
	const limit = isBuildingList
		? (context.getNodeParameter('buildingLimit', itemIndex, 100) as number)
		: (context.getNodeParameter('limit', itemIndex, 100) as number);
	if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1)) {
		throw new NodeOperationError(context.getNode(), 'Limit must be a positive whole number.');
	}

	let path: string;
	const filters: IDataObject = {};
	if (operation === 'getAll' && resource === 'building') {
		path = '/api/Buildings';
		const scope = context.getNodeParameter('buildingScope', itemIndex, 'all') as string;
		for (const [kind, param, base] of [
			['organization', 'organizationId', 'Organizations'],
			['site', 'siteId', 'Sites'],
		]) {
			if (scope !== kind) continue;
			const id = (
				context.getNodeParameter(param, itemIndex, '', { extractValue: true }) as string
			).trim();
			if (!id) {
				throw new NodeOperationError(context.getNode(), `${param === 'siteId' ? 'Site' : 'Organization'} ID is required.`);
			}
			path = `/api/${base}/${encodeURIComponent(id)}/Buildings`;
		}
		const extra = context.getNodeParameter('buildingFilters', itemIndex, {}) as IDataObject;
		for (const key of ['referenceId', 'metadata', 'floorCount', 'spaceCount', 'measurementCount', 'orderBy']) {
			const v = extra[key];
			if (v !== undefined && v !== null && v !== '') filters[key] = v as string | number;
		}
		if (extra.includeCounts === true) filters.includeCounts = true;
		const name = context.getNodeParameter('name', itemIndex, '') as string;
		if (name) filters.name = name;
	} else if (operation === 'getById' && resource === 'building') {
		const buildingId = context.getNodeParameter('buildingId', itemIndex, '', {
			extractValue: true,
		}) as string;
		if (!buildingId.trim()) {
			throw new NodeOperationError(context.getNode(), 'Building ID is required.');
		}
		path = `/api/Buildings/${encodeURIComponent(buildingId)}`;
	} else if (operation === 'getAll' && resource === 'measurementValue') {
		const buildingId = context.getNodeParameter('buildingId', itemIndex, '', {
			extractValue: true,
		}) as string;
		if (!buildingId.trim()) {
			throw new NodeOperationError(context.getNode(), 'Building ID is required.');
		}
		path = `/api/Buildings/${encodeURIComponent(buildingId)}/MeasurementValues`;
		for (const name of ['name', 'ontologyType', 'unit']) {
			const value = context.getNodeParameter(name, itemIndex, '') as string;
			if (value) filters[name] = value;
		}
	} else if (operation === 'getHistorical' && resource === 'building') {
		const buildingId = context.getNodeParameter('buildingId', itemIndex, '', {
			extractValue: true,
		}) as string;
		if (!buildingId.trim()) {
			throw new NodeOperationError(context.getNode(), 'Building ID is required.');
		}
		path = `/api/Buildings/${encodeURIComponent(buildingId)}/HistoricalValues`;
	} else if (operation === 'getHistorical' && resource === 'measurementValue') {
		const measurementId = context.getNodeParameter('measurementId', itemIndex, '', {
			extractValue: true,
		}) as string;
		if (!measurementId.trim()) {
			throw new NodeOperationError(context.getNode(), 'Measurement point ID is required.');
		}
		path = `/api/MeasurementValue/${encodeURIComponent(measurementId)}/HistoricalValues`;
	} else {
		throw new NodeOperationError(context.getNode(), 'This BDP operation is not supported.');
	}

	if (operation === 'getHistorical') {
		const start = context.getNodeParameter('start', itemIndex) as string;
		const end = context.getNodeParameter('end', itemIndex) as string;
		Object.assign(filters, normalizeWindow(start, end), { orderBy: 'TimestampAscending' });
	}

	if (operation === 'getById') {
		const getQs: IDataObject = {};
		if (resource === 'building') {
			const opts = context.getNodeParameter('buildingGetOptions', itemIndex, {}) as IDataObject;
			if (opts.includeCounts === true) getQs.includeCounts = true;
		}
		const response = await getBdpRequest(context)(path, getQs);
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(context.getNode(), 'BDP returned an invalid building detail response.');
		}
		return [response.data as IDataObject];
	}

	return fetchAllPages(getBdpRequest(context), path, filters, { returnAll, limit });
}

export class Bdp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Building Data Platform',
		name: 'bdp',
		icon: { light: 'file:../../icons/bdp.svg', dark: 'file:../../icons/bdp.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Community-maintained, read-only operations for Schneider Electric BDP.',
		defaults: { name: 'Building Data Platform' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'bdpOAuth2Api', required: true }],
		properties,
	};

	methods = {
		listSearch: {
			getBuildings,
			getOrganizations,
			getSites,
			getMeasurementValues,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputItems = this.getInputData();
		const output: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
			try {
				const records = await executeOperation(this, itemIndex);
				for (const record of records) {
					output.push({ json: record, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				const nodeError = new NodeOperationError(this.getNode(), error as Error, { itemIndex });
				if (!this.continueOnFail()) throw nodeError;
				output.push({
					json: { error: nodeError.message },
					error: nodeError,
					pairedItem: { item: itemIndex },
				});
			}
		}

		return [output];
	}
}
