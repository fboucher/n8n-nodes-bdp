import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

const scopeOptions = [
	{ name: 'All Accessible', value: 'all' },
	{ name: 'Within Organization', value: 'organization' },
	{ name: 'Within Site', value: 'site' },
];

export const buildingScopeProperties: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'scope',
		type: 'options',
		options: scopeOptions,
		default: 'all',
		displayOptions: { show: { resource: ['building'], operation: ['getAll'] } },
		description: 'Choose which buildings to list',
	},
	{
		displayName: 'Building Search Scope',
		name: 'buildingSearchScope',
		type: 'options',
		options: scopeOptions,
		default: 'all',
		displayOptions: { show: { resource: ['building'], operation: ['getById', 'getHistorical'] } },
		description: 'Optionally narrow the Building selector to an organization or site',
	},
	{
		displayName: 'Building Search Scope',
		name: 'buildingSearchScope',
		type: 'options',
		options: scopeOptions,
		default: 'all',
		displayOptions: {
			show: { resource: ['measurementValue'], operation: ['getAll', 'getHistorical'] },
		},
		description: 'Optionally narrow the Building selector to an organization or site',
	},
	{
		displayName: 'Building Search Scope',
		name: 'buildingSearchScope',
		type: 'options',
		options: scopeOptions,
		default: 'all',
		displayOptions: {
			show: { resource: ['floor'], operation: ['getAll', 'getById'] },
		},
		description: 'Optionally narrow the Building selector to an organization or site',
	},
	...[
		{ scopeParameter: 'scope', resource: 'building', operations: ['getAll'] },
		{
			scopeParameter: 'buildingSearchScope',
			resource: 'building',
			operations: ['getById', 'getHistorical'],
		},
		{
			scopeParameter: 'buildingSearchScope',
			resource: 'measurementValue',
			operations: ['getAll', 'getHistorical'],
		},
		{
			scopeParameter: 'buildingSearchScope',
			resource: 'floor',
			operations: ['getAll', 'getById'],
		},
	].flatMap(({ scopeParameter, resource, operations }) => {
		const show = { resource: [resource], operation: operations };
		return [
			createResourceLocator({
				displayName: 'Organization',
				name: 'organizationId',
				searchMethod: 'getOrganizations',
				listPlaceholder: 'Select an organization...',
				idPlaceholder: 'Enter an organization ID',
				displayOptions: { show: { ...show, [scopeParameter]: ['organization'] } },
			}),
			createResourceLocator({
				displayName: 'Site',
				name: 'siteId',
				searchMethod: 'getSites',
				listPlaceholder: 'Select a site...',
				idPlaceholder: 'Enter a site ID',
				displayOptions: { show: { ...show, [scopeParameter]: ['site'] } },
			}),
		];
	}),
];

export const buildingFilters: INodeProperties[] = [
	...[
		{ displayName: 'Reference ID', name: 'referenceId', type: 'string' as const },
		{ displayName: 'Metadata', name: 'metadata', type: 'string' as const },
		{ displayName: 'Floor Count', name: 'floorCount', type: 'number' as const },
		{ displayName: 'Space Count', name: 'spaceCount', type: 'number' as const },
		{ displayName: 'Measurement Count', name: 'measurementCount', type: 'number' as const },
		{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
	].map((filter) => ({
		...filter,
		default: '',
		displayOptions: { show: { resource: ['building'], operation: ['getAll'] } },
		description: `Filter or order buildings by ${filter.displayName.toLowerCase()}`,
	})),
	{
		displayName: 'Include Counts',
		name: 'includeCounts',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['building'], operation: ['getAll', 'getById'] } },
		description: 'Whether to request floor, space, and measurement counts',
	},
];

export const buildingResource: INodeProperties = createResourceLocator({
	displayName: 'Building',
	name: 'buildingId',
	searchMethod: 'getBuildings',
	listPlaceholder: 'Select a building...',
	idPlaceholder: 'Enter a building ID',
	displayOptions: {
		show: {
			operation: ['getById', 'getHistorical'],
			resource: ['building'],
		},
	},
});

export const buildingOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['building'] } },
	options: [
		// Keep the familiar List label while retaining the getAll operation ID.
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'List buildings' },
		{ name: 'Get', value: 'getById', action: 'Get a building' },
		{ name: 'Historical Values', value: 'getHistorical', action: 'Get building history' },
	],
	default: 'getAll',
};
