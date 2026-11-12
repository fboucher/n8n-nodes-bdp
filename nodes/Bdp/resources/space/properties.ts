import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';
import { buildingResource } from '../building/properties';

const listShow = { resource: ['space'], operation: ['getAll'] };
const getShow = { resource: ['space'], operation: ['getById'] };
const anyShow = { resource: ['space'], operation: ['getAll', 'getById'] };

const scopeOptions = [
	{ name: 'In Building', value: 'building' },
	{ name: 'On Floor', value: 'floor' },
];

function floorLocator(show: Record<string, string[]>, required: boolean): INodeProperties {
	return {
		...createResourceLocator({
			displayName: 'Floor',
			name: 'floorId',
			searchMethod: 'getFloors',
			listPlaceholder: 'Select a floor...',
			idPlaceholder: 'Enter a floor ID',
			required,
			displayOptions: { show },
		}),
		typeOptions: { loadOptionsDependsOn: ['buildingId.value'] },
	};
}

export const spaceScopeProperties: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'spaceScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: listShow },
		description: 'Choose where to list spaces from',
	},
	{
		displayName: 'Space Search Scope',
		name: 'spaceScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: getShow },
		description:
			'Choose the building or floor the Space selector searches; not needed when entering a Space ID',
	},
	{
		...buildingResource,
		displayOptions: { show: { ...listShow, spaceScope: ['building'] } },
	},
	{
		...buildingResource,
		required: false,
		displayOptions: { show: { ...getShow, spaceScope: ['building'] } },
		description: 'Select a building to search its spaces; not needed when entering a Space ID',
	},
	{
		...buildingResource,
		displayName: 'Building (to Search Floors)',
		required: false,
		displayOptions: { show: { ...anyShow, spaceScope: ['floor'] } },
		description: 'Select a building to search its floors; not needed when entering a Floor ID',
	},
	floorLocator({ ...listShow, spaceScope: ['floor'] }, true),
	{
		...floorLocator({ ...getShow, spaceScope: ['floor'] }, false),
		description: 'Select a floor to search its spaces; not needed when entering a Space ID',
	},
];

export const spaceResource: INodeProperties = {
	...createResourceLocator({
		displayName: 'Space',
		name: 'spaceId',
		searchMethod: 'getSpaces',
		listPlaceholder: 'Select a space...',
		idPlaceholder: 'Enter a space ID',
		displayOptions: { show: getShow },
	}),
	typeOptions: {
		loadOptionsDependsOn: ['spaceScope', 'buildingId.value', 'floorId.value'],
	},
};

export const spaceOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['space'] } },
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many spaces' },
		{ name: 'Get', value: 'getById', action: 'Get a space' },
	],
	default: 'getAll',
};

export const spaceFilters: INodeProperties[] = [
	{ displayName: 'Reference ID', name: 'referenceId', type: 'string' as const },
	{ displayName: 'Metadata', name: 'metadata', type: 'string' as const },
	{ displayName: 'Ontology Type', name: 'ontologyType', type: 'string' as const },
	{ displayName: 'Measurement Count', name: 'measurementCount', type: 'number' as const },
	{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
].map((filter) => ({
	...filter,
	default: '',
	displayOptions: { show: listShow },
	description: `Filter or order spaces by ${filter.displayName.toLowerCase()}`,
}));

export const spaceCommissionedStatus: INodeProperties = {
	displayName: 'Commissioned Status',
	name: 'commissionedStatus',
	type: 'options',
	options: [
		{ name: 'Any', value: '' },
		{ name: 'Commissioned', value: 'Commissioned' },
		{ name: 'Decommissioned', value: 'Decommissioned' },
	],
	default: '',
	displayOptions: { show: listShow },
	description: 'Only return spaces with this commissioned status',
};

export const spacePaginationProperties: INodeProperties[] = [
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
