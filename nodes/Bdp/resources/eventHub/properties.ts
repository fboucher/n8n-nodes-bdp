import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

const listShow = { resource: ['eventHub'], operation: ['getAll'] };

export const eventHubResource: INodeProperties = createResourceLocator({
	displayName: 'Event Hub',
	name: 'eventHubId',
	searchMethod: 'getEventHubs',
	listPlaceholder: 'Select a event hub...',
	idPlaceholder: 'Enter a event hub ID',
	displayOptions: { show: { resource: ['eventHub'], operation: ['getById'] } },
});

export const eventHubOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['eventHub'] } },
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many event hubs' },
		{ name: 'Get', value: 'getById', action: 'Get a event hub' },
	],
	default: 'getAll',
};

export const eventHubFilters: INodeProperties[] = [
	{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
].map((filter) => ({
	...filter,
	default: '',
	displayOptions: { show: listShow },
	description: `Filter or order event hubs by ${filter.displayName.toLowerCase()}`,
}));

export const eventHubPaginationProperties: INodeProperties[] = [
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
