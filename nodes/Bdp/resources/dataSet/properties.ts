import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

const listShow = { resource: ['dataSet'], operation: ['getAll'] };

export const dataSetResource: INodeProperties = createResourceLocator({
	displayName: 'Data Set',
	name: 'dataSetId',
	searchMethod: 'getDataSets',
	listPlaceholder: 'Select a data set...',
	idPlaceholder: 'Enter a data set ID',
	displayOptions: { show: { resource: ['dataSet'], operation: ['getById', 'update', 'delete'] } },
});

export const dataSetOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['dataSet'] } },
	// Read operations stay first so the existing List default is unchanged.
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many data sets' },
		{ name: 'Get', value: 'getById', action: 'Get a data set' },
		{ name: 'Create', value: 'create', action: 'Create a data set' },
		{ name: 'Update', value: 'update', action: 'Update a data set' },
		{ name: 'Delete', value: 'delete', action: 'Delete a data set' },
	],
	default: 'getAll',
};

export const dataSetFilters: INodeProperties[] = [
	{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
].map((filter) => ({
	...filter,
	default: '',
	displayOptions: { show: listShow },
	description: `Filter or order data sets by ${filter.displayName.toLowerCase()}`,
}));

export const dataSetPaginationProperties: INodeProperties[] = [
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

const createShow = { resource: ['dataSet'], operation: ['create'] };
const updateShow = { resource: ['dataSet'], operation: ['update'] };
const membersDefault = JSON.stringify(
	{ buildings: [], floors: [], spaces: [], devices: [], measurementValues: [] },
	null,
	2,
);

export const dataSetWriteProperties: INodeProperties[] = [
	{
		displayName: 'Deleting a data set cannot be undone. Test on a throwaway data set first.',
		name: 'dataSetDeleteNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['dataSet'], operation: ['delete'] } },
	},
	{
		displayName: 'Name',
		name: 'dataSetName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: createShow },
		description: 'Name of the new data set',
	},
	{
		displayName: 'Expires On',
		name: 'dataSetExpiresOn',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2026-12-31T00:00:00Z',
		displayOptions: { show: createShow },
		description: 'When the data set expires: ISO 8601 with seconds and an explicit UTC offset or Z',
	},
	{
		displayName: 'Members',
		name: 'dataSetMembers',
		type: 'json',
		required: true,
		default: membersDefault,
		displayOptions: { show: createShow },
		description:
			'JSON object listing member IDs (UUIDs) by category: buildings, floors, spaces, devices, measurementValues. Missing categories are sent as empty lists.',
	},
	{
		displayName: 'Update Fields',
		name: 'dataSetUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: updateShow },
		description: 'The fields to change; at least one is required',
		options: [
			{
				displayName: 'Expires On',
				name: 'expiresOn',
				type: 'string',
				default: '',
				placeholder: '2026-12-31T00:00:00Z',
				description: 'ISO 8601 with seconds and an explicit UTC offset or Z',
			},
			{
				displayName: 'Members (Replaces All Members)',
				name: 'members',
				type: 'json',
				default: membersDefault,
				description:
					'The complete new member list, as JSON by category (buildings, floors, spaces, devices, measurementValues). This REPLACES all current members; partial member edits are not supported, and categories you omit become empty.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The new name of the data set',
			},
		],
	},
];
