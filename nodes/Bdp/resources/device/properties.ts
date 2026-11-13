import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';
import { buildingResource } from '../building/properties';
import { sourceResource } from '../source/properties';
import { spaceResource } from '../space/properties';

type Show = Record<string, string[]>;

const listShow: Show = { resource: ['device'], operation: ['getAll'] };
const getShow: Show = { resource: ['device'], operation: ['getById', 'getHistorical'] };

const scopeOptions = [
	{ name: 'In Building', value: 'building' },
	{ name: 'On Floor', value: 'floor' },
	{ name: 'In Space', value: 'space' },
	{ name: 'From Source', value: 'source' },
];

const spaceScopeOptions = [
	{ name: 'In Building', value: 'building' },
	{ name: 'On Floor', value: 'floor' },
];

const floorLocator = (show: Show, required: boolean): INodeProperties => ({
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
});

// Parent selectors for one operation. The parent is required for List; for Get
// it only narrows the Device selector, so manual IDs need no parent.
function parentSelectors(base: Show, required: boolean): INodeProperties[] {
	const hint = required ? '' : '; not needed when entering a Device ID';
	const building = (show: Show, displayName: string, description: string, isRequired: boolean) => ({
		...buildingResource,
		displayName,
		required: isRequired,
		displayOptions: { show },
		description,
	});
	return [
		building(
			{ ...base, deviceScope: ['building'] },
			'Building',
			`Select a building to list or search its devices${hint}`,
			required,
		),
		building(
			{ ...base, deviceScope: ['floor'] },
			'Building (to Search Floors)',
			'Select a building to search its floors; not needed when entering a Floor ID',
			false,
		),
		floorLocator({ ...base, deviceScope: ['floor'] }, required),
		{
			displayName: 'Space Search Scope',
			name: 'spaceScope',
			type: 'options',
			options: spaceScopeOptions,
			default: 'building',
			displayOptions: { show: { ...base, deviceScope: ['space'] } },
			description: 'Choose the building or floor the Space selector searches',
		},
		building(
			{ ...base, deviceScope: ['space'], spaceScope: ['building'] },
			'Building (to Search Spaces)',
			'Select a building to search its spaces; not needed when entering a Space ID',
			false,
		),
		building(
			{ ...base, deviceScope: ['space'], spaceScope: ['floor'] },
			'Building (to Search Floors)',
			'Select a building to search its floors; not needed when entering a Floor ID',
			false,
		),
		{
			...floorLocator({ ...base, deviceScope: ['space'], spaceScope: ['floor'] }, false),
			description: 'Select a floor to search its spaces; not needed when entering a Space ID',
		},
		{
			...spaceResource,
			required,
			displayOptions: { show: { ...base, deviceScope: ['space'] } },
		},
		{
			...sourceResource,
			required,
			displayOptions: { show: { ...base, deviceScope: ['source'] } },
		},
	];
}

export const deviceScopeProperties: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'deviceScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: listShow },
		description: 'Choose where to list devices from',
	},
	{
		displayName: 'Device Search Scope',
		name: 'deviceScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: getShow },
		description:
			'Choose the parent the Device selector searches; not needed when entering a Device ID',
	},
	...parentSelectors(listShow, true),
	...parentSelectors(getShow, false),
];

export const deviceResource: INodeProperties = {
	...createResourceLocator({
		displayName: 'Device',
		name: 'deviceId',
		searchMethod: 'getDevices',
		listPlaceholder: 'Select a device...',
		idPlaceholder: 'Enter a device ID',
		displayOptions: { show: getShow },
	}),
	typeOptions: {
		loadOptionsDependsOn: ['deviceScope', 'buildingId.value', 'floorId.value', 'spaceId.value', 'sourceId.value'],
	},
};

export const deviceOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['device'] } },
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many devices' },
		{ name: 'Get', value: 'getById', action: 'Get a device' },
		{ name: 'Historical Values', value: 'getHistorical', action: 'Get device history' },
	],
	default: 'getAll',
};

export const deviceFilters: INodeProperties[] = [
	{ displayName: 'Reference ID', name: 'referenceId', type: 'string' as const },
	{ displayName: 'Metadata', name: 'metadata', type: 'string' as const },
	{ displayName: 'Ontology Type', name: 'ontologyType', type: 'string' as const },
	{ displayName: 'Product Type', name: 'productType', type: 'string' as const },
	{ displayName: 'Vendor Identifier', name: 'vendorIdentifier', type: 'string' as const },
	{ displayName: 'Order By', name: 'orderBy', type: 'string' as const },
].map((filter) => ({
	...filter,
	default: '',
	displayOptions: { show: listShow },
	description: `Filter or order devices by ${filter.displayName.toLowerCase()}`,
}));

export const deviceCommissionedStatus: INodeProperties = {
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
	description: 'Only return devices with this commissioned status',
};

const pageShow = { ...listShow, operation: ['getAll', 'getHistorical'] };

export const devicePaginationProperties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: pageShow },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit
		default: 100,
		displayOptions: { show: { ...pageShow, returnAll: [false] } },
		description: 'Max number of results to return',
	},
];
