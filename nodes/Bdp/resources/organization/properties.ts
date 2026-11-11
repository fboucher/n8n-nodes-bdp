import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

export const organizationResource: INodeProperties = createResourceLocator({
	displayName: 'Organization',
	name: 'organizationId',
	searchMethod: 'getOrganizations',
	listPlaceholder: 'Select an organization...',
	idPlaceholder: 'Enter an organization ID',
	displayOptions: {
		show: {
			operation: ['getById'],
			resource: ['organization'],
		},
	},
});

export const organizationOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['organization'] } },
	options: [
		// Keep the familiar List label while retaining the getAll operation ID.
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many organizations' },
		{ name: 'Get', value: 'getById', action: 'Get an organization' },
	],
	default: 'getAll',
};

export const organizationFilters: INodeProperties[] = [
	{
		displayName: 'Site Count',
		name: 'siteCount',
		type: 'number',
		default: '',
		displayOptions: { show: { resource: ['organization'], operation: ['getAll'] } },
		description: 'Filter organizations by site count',
	},
	{
		displayName: 'Order By',
		name: 'orderBy',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['organization'], operation: ['getAll'] } },
		description: 'Order the results using a BDP-supported field',
	},
];
