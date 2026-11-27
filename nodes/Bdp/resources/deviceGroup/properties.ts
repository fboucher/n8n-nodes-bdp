import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';
import { buildingResource } from '../building/properties';
import { sourceResource } from '../source/properties';

type Show = Record<string, string[]>;

const listShow: Show = { resource: ['deviceGroup'], operation: ['getAll'] };
const getShow: Show = {
	resource: ['deviceGroup'],
	operation: ['getById', 'getHistorical', 'setOnDemand', 'getOnDemand'],
};

const scopeOptions = [
	{ name: 'In Building', value: 'building' },
	{ name: 'From Source', value: 'source' },
];

// The parent is required for List; for Get it only narrows the selector.
function parentSelectors(base: Show, required: boolean): INodeProperties[] {
	const hint = required ? '' : '; not needed when entering a Device Group ID';
	return [
		{
			...buildingResource,
			required,
			displayOptions: { show: { ...base, deviceGroupScope: ['building'] } },
			description: `Select a building to list or search its device groups${hint}`,
		},
		{
			...sourceResource,
			required,
			displayOptions: { show: { ...base, deviceGroupScope: ['source'] } },
			description: `Select a source to list or search its device groups${hint}`,
		},
	];
}

export const deviceGroupScopeProperties: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'deviceGroupScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: listShow },
		description: 'Choose where to list device groups from',
	},
	{
		displayName: 'Device Group Search Scope',
		name: 'deviceGroupScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: getShow },
		description:
			'Choose the building or source the Device Group selector searches; not needed when entering a Device Group ID',
	},
	...parentSelectors(listShow, true),
	...parentSelectors(getShow, false),
];

export const deviceGroupResource: INodeProperties = {
	...createResourceLocator({
		displayName: 'Device Group',
		name: 'deviceGroupId',
		searchMethod: 'getDeviceGroups',
		listPlaceholder: 'Select a device group...',
		idPlaceholder: 'Enter a device group ID',
		displayOptions: { show: getShow },
	}),
	typeOptions: {
		loadOptionsDependsOn: ['deviceGroupScope', 'buildingId.value', 'sourceId.value'],
	},
};

export const deviceGroupOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['deviceGroup'] } },
	// Read operations stay first so the existing List default is unchanged.
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		// eslint-disable-next-line n8n-nodes-base/node-param-option-name-wrong-for-get-many
		{ name: 'List', value: 'getAll', action: 'Get many device groups' },
		{ name: 'Get', value: 'getById', action: 'Get a device group' },
		{ name: 'Historical Values', value: 'getHistorical', action: 'Get device group history' },
		{ name: 'Get On Demand', value: 'getOnDemand', action: 'Read live values from the source system' },
		{ name: 'Set On Demand', value: 'setOnDemand', action: 'Write values to the source system' },
	],
	default: 'getAll',
};

const timestampFilter = (displayName: string, name: string, verb: string): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	placeholder: '2025-01-01T00:00:00Z',
	displayOptions: { show: listShow },
	description: `Only return device groups ${verb} this ISO 8601 timestamp with seconds and an explicit UTC offset or Z`,
});

export const deviceGroupFilters: INodeProperties[] = [
	...[
		{ displayName: 'Reference ID', name: 'referenceId' },
		{ displayName: 'Metadata', name: 'metadata' },
		{ displayName: 'Order By', name: 'orderBy' },
	].map(
		(filter): INodeProperties => ({
			...filter,
			type: 'string',
			default: '',
			displayOptions: { show: listShow },
			description: `Filter or order device groups by ${filter.displayName.toLowerCase()}`,
		}),
	),
	{
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
		description: 'Only return device groups with this commissioned status',
	},
	timestampFilter('Commissioned Before', 'commissionedBefore', 'commissioned before'),
	timestampFilter('Decommissioned After', 'decommissionedAfter', 'decommissioned after'),
];

const pageShow = { ...listShow, operation: ['getAll', 'getHistorical'] };

export const deviceGroupPaginationProperties: INodeProperties[] = [
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

const onDemandShow = { resource: ['deviceGroup'], operation: ['setOnDemand', 'getOnDemand'] };

export const deviceGroupOnDemandProperties: INodeProperties[] = [
	{
		displayName:
			'Set On Demand writes values straight to the real source system and can have physical effects. It is never retried automatically. Get On Demand reads live values and bypasses stored measurement values. Send one input item per point.',
		name: 'onDemandWarning',
		type: 'notice',
		default: '',
		displayOptions: { show: onDemandShow },
	},
	{
		displayName: 'Point ID',
		name: 'onDemandPointId',
		type: 'string',
		default: '',
		displayOptions: { show: onDemandShow },
		description:
			'ID of the point for each input item; use an expression to read it from the item. Set exactly one of Point ID or Point Path.',
	},
	{
		displayName: 'Point Path',
		name: 'onDemandPointPath',
		type: 'string',
		default: '',
		displayOptions: { show: onDemandShow },
		description:
			'Path of the point for each input item; use an expression to read it from the item. Set exactly one of Point ID or Point Path.',
	},
	{
		displayName: 'Value',
		name: 'onDemandValue',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['deviceGroup'], operation: ['setOnDemand'] } },
		description: 'The value to write for each input item, sent as text; use an expression to read it from the item',
	},
];
