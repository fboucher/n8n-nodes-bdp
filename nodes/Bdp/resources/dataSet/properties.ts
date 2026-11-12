import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

const listShow = { resource: ['dataSet'], operation: ['getAll'] };

export const dataSetResource: INodeProperties = createResourceLocator({
	displayName: 'Data Set',
	name: 'dataSetId',
	searchMethod: 'getDataSets',
	listPlaceholder: 'Select a data set...',
	idPlaceholder: 'Enter a data set ID',
	displayOptions: { show: { resource: ['dataSet'], operation: ['getById'] } },
});

export const dataSetOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['dataSet'] } },
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many data sets' },
		{ name: 'Get', value: 'getById', action: 'Get a data set' },
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
