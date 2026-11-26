import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

const listShow = { resource: ['eventHub'], operation: ['getAll'] };

export const eventHubResource: INodeProperties = createResourceLocator({
	displayName: 'Event Hub',
	name: 'eventHubId',
	searchMethod: 'getEventHubs',
	listPlaceholder: 'Select a event hub...',
	idPlaceholder: 'Enter a event hub ID',
	displayOptions: { show: { resource: ['eventHub'], operation: ['getById', 'update'] } },
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
		{ name: 'Update', value: 'update', action: 'Update an event hub' },
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

export const eventHubUpdateProperties: INodeProperties[] = [
	{
		displayName:
			'Changing an event hub affects every downstream consumer of its telemetry. Reducing partitions or retention may be rejected by BDP.',
		name: 'eventHubUpdateNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['eventHub'], operation: ['update'] } },
	},
	{
		displayName: 'Update Fields',
		name: 'eventHubUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['eventHub'], operation: ['update'] } },
		description: 'The fields to change; at least one is required',
		options: [
			{
				displayName: 'Consumer Groups',
				name: 'consumerGroups',
				type: 'string',
				default: '',
				placeholder: 'group-a, group-b',
				description:
					'Comma-separated consumer group names. This REPLACES the whole list of consumer groups.',
			},
			{
				displayName: 'Partition Count',
				name: 'partitionCount',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 1,
				description: 'The new number of partitions (a whole number)',
			},
			{
				displayName: 'Retention Policy',
				name: 'retentionPolicy',
				type: 'string',
				default: '',
				description: 'The new retention policy value, as text',
			},
			{
				displayName: 'Telemetry Payload Format',
				name: 'telemetryPayloadFormat',
				type: 'string',
				default: '',
				description: 'The new telemetry payload format, as text',
			},
		],
	},
];
