import type { INodeProperties } from 'n8n-workflow';

export const paginationProperties: INodeProperties[] = [
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

export const resourceProperty: INodeProperties = {
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
};

export const nameFilter: INodeProperties = {
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
};

export const historyProperties: INodeProperties[] = [
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
];
