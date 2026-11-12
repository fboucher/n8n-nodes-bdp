import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';
import { buildingResource } from '../building/properties';

export const floorBuildingResource: INodeProperties = {
	...buildingResource,
	displayOptions: { show: { resource: ['floor'], operation: ['getAll'] } },
};

export const floorGetBuildingResource: INodeProperties = {
	...buildingResource,
	required: false,
	displayOptions: { show: { resource: ['floor'], operation: ['getById', 'getHistorical'] } },
	description: 'Select a building to search its floors; not needed when entering a Floor ID',
};

export const floorResource: INodeProperties = {
	...createResourceLocator({
		displayName: 'Floor',
		name: 'floorId',
		searchMethod: 'getFloors',
		listPlaceholder: 'Select a floor...',
		idPlaceholder: 'Enter a floor ID',
		displayOptions: { show: { resource: ['floor'], operation: ['getById', 'getHistorical'] } },
	}),
	typeOptions: { loadOptionsDependsOn: ['buildingId.value'] },
};

export const floorOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['floor'] } },
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many floors' },
		{ name: 'Get', value: 'getById', action: 'Get a floor' },
		{ name: 'Historical Values', value: 'getHistorical', action: 'Get floor history' },
	],
	default: 'getAll',
};

export const floorFilters: INodeProperties[] = [
	{ displayName: 'Reference ID', name: 'referenceId', type: 'string' as const },
	{ displayName: 'Metadata', name: 'metadata', type: 'string' as const },
	{ displayName: 'Space Count', name: 'spaceCount', type: 'number' as const },
	{ displayName: 'Measurement Count', name: 'measurementCount', type: 'number' as const },
	{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
].map((filter) => ({
	...filter,
	default: '',
	displayOptions: { show: { resource: ['floor'], operation: ['getAll'] } },
	description: `Filter or order floors by ${filter.displayName.toLowerCase()}`,
}));

export const floorPaginationProperties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['floor'], operation: ['getAll', 'getHistorical'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit
		default: 100,
		displayOptions: {
			show: { resource: ['floor'], operation: ['getAll', 'getHistorical'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
];
