import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

const listShow = { resource: ['source'], operation: ['getAll'] };

export const sourceResource: INodeProperties = createResourceLocator({
	displayName: 'Source',
	name: 'sourceId',
	searchMethod: 'getSources',
	listPlaceholder: 'Select a source...',
	idPlaceholder: 'Enter a source ID',
	displayOptions: { show: { resource: ['source'], operation: ['getById'] } },
});

export const sourceOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['source'] } },
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many sources' },
		{ name: 'Get', value: 'getById', action: 'Get a source' },
	],
	default: 'getAll',
};

export const sourceFilters: INodeProperties[] = [
	{ displayName: 'Type', name: 'type', type: 'string' as const },
	{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
].map((filter) => ({
	...filter,
	default: '',
	displayOptions: { show: listShow },
	description: `Filter or order sources by ${filter.displayName.toLowerCase()}`,
}));

export const sourcePaginationProperties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: listShow },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit
		default: 100,
		displayOptions: { show: { ...listShow, returnAll: [false] } },
		description: 'Max number of results to return',
	},
];
