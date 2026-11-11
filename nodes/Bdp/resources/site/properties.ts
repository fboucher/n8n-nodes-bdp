import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

export const siteOrganizationResource: INodeProperties = createResourceLocator({
	displayName: 'Organization',
	name: 'organizationId',
	searchMethod: 'getOrganizations',
	listPlaceholder: 'Select an organization...',
	idPlaceholder: 'Enter an organization ID',
	displayOptions: {
		show: {
			operation: ['getAll'],
			resource: ['site'],
			scope: ['organization'],
		},
	},
});

export const siteGetOrganizationResource: INodeProperties = {
	...createResourceLocator({
		displayName: 'Organization',
		name: 'organizationId',
		searchMethod: 'getOrganizations',
		listPlaceholder: 'Select an organization...',
		idPlaceholder: 'Enter an organization ID',
		required: false,
		displayOptions: {
			show: {
				operation: ['getById'],
				resource: ['site'],
			},
		},
	}),
	description: 'Optionally narrow the Site selector to one organization',
};

export const siteResource: INodeProperties = createResourceLocator({
	displayName: 'Site',
	name: 'siteId',
	searchMethod: 'getSites',
	listPlaceholder: 'Select a site...',
	idPlaceholder: 'Enter a site ID',
	displayOptions: {
		show: {
			operation: ['getById'],
			resource: ['site'],
		},
	},
});

export const siteOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['site'] } },
	options: [
		// Keep the familiar List label while retaining the getAll operation ID.
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many sites' },
		{ name: 'Get', value: 'getById', action: 'Get a site' },
	],
	default: 'getAll',
};

export const siteFilters: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		options: [
			{ name: 'All Accessible', value: 'all' },
			{ name: 'Within Organization', value: 'organization' },
		],
		default: 'all',
		displayOptions: { show: { resource: ['site'], operation: ['getAll'] } },
		description: 'Choose whether to list all accessible sites or sites in one organization',
	},
	{
		displayName: 'Metadata',
		name: 'metadata',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['site'], operation: ['getAll'] } },
		description: 'Filter sites by metadata',
	},
	{
		displayName: 'Building Count',
		name: 'buildingCount',
		type: 'number',
		default: '',
		displayOptions: { show: { resource: ['site'], operation: ['getAll'] } },
		description: 'Filter sites by building count',
	},
	{
		displayName: 'Order By',
		name: 'orderBy',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['site'], operation: ['getAll'] } },
		description: 'Order the results using a BDP-supported field',
	},
];
