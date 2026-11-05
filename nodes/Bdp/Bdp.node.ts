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
import { getMeasurementValues } from './listSearch/getMeasurementValues';
import { normalizeWindow } from './shared/time';
import { fetchAllPages, getBdpRequest } from './shared/transport';

const buildingResource: INodeProperties = {
	displayName: 'Building',
	name: 'buildingId',
	type: 'resourceLocator' as const,
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: {
		show: {
			operation: ['getAll', 'getHistorical'],
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
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				operation: ['getAll', 'getHistorical'],
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
				operation: ['getAll', 'getHistorical'],
				returnAll: [false],
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
			{ name: 'Get Many', value: 'getAll', action: 'List buildings' },
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
	const returnAll = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = context.getNodeParameter('limit', itemIndex, 100) as number;
	if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1)) {
		throw new NodeOperationError(context.getNode(), 'Limit must be a positive whole number.');
	}

	let path: string;
	const filters: IDataObject = {};
	if (operation === 'getAll' && resource === 'building') {
		path = '/api/Buildings';
		const name = context.getNodeParameter('name', itemIndex, '') as string;
		if (name) filters.name = name;
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
