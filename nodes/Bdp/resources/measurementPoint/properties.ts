import type { INodeProperties } from 'n8n-workflow';

import { buildingResource } from '../building/properties';
import { createResourceLocator } from '../../shared/locator';
import {
	dataSetSelector,
	deviceChain,
	deviceGroupChain,
	floorChain,
	spaceChain,
	type Show,
} from '../../shared/parents';

const listShow: Show = { resource: ['measurementValue'], operation: ['getAll'] };
// Get and Historical Values only use a parent to narrow the Measurement Point selector.
const selectShow: Show = { resource: ['measurementValue'], operation: ['getById', 'getHistorical'] };

// Update (single mode) uses the same selector as Get, narrowed by a parent; batch targets a device group.
const updateSingleShow: Show = {
	resource: ['measurementValue'],
	operation: ['update'],
	updateMode: ['single'],
};
const updateBatchShow: Show = {
	resource: ['measurementValue'],
	operation: ['update'],
	updateMode: ['batch'],
};

const scopeOptions = [
	{ name: 'In Building', value: 'building' },
	{ name: 'On Floor', value: 'floor' },
	{ name: 'In Space', value: 'space' },
	{ name: 'On Device', value: 'device' },
	{ name: 'In Device Group', value: 'deviceGroup' },
	{ name: 'In Data Set', value: 'dataSet' },
];

export const measurementBuildingResource: INodeProperties = {
	...buildingResource,
	required: false,
	displayOptions: {
		show: {
			operation: ['getAll', 'getById', 'getHistorical'],
			resource: ['measurementValue'],
			measurementScope: ['building'],
		},
	},
};

function parentSelectors(base: Show, required: boolean): INodeProperties[] {
	const scoped = (scope: string): Show => ({ ...base, measurementScope: [scope] });
	return [
		...floorChain(scoped('floor'), required),
		...spaceChain(scoped('space'), required),
		...deviceChain(scoped('device'), required),
		...deviceGroupChain(scoped('deviceGroup'), required),
		dataSetSelector(scoped('dataSet'), required),
	];
}

export const measurementScopeProperties: INodeProperties[] = [
	{
		displayName: 'Scope',
		name: 'measurementScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: listShow },
		description: 'Choose where to list measurement points from',
	},
	{
		displayName: 'Measurement Point Search Scope',
		name: 'measurementScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: selectShow },
		description:
			'Choose the parent the Measurement Point selector searches; not needed when entering a Measurement Point ID',
	},
	{
		displayName: 'Measurement Point Search Scope',
		name: 'measurementScope',
		type: 'options',
		options: scopeOptions,
		default: 'building',
		displayOptions: { show: updateSingleShow },
		description:
			'Choose the parent the Measurement Point selector searches; not needed when entering a Measurement Point ID',
	},
	measurementBuildingResource,
	{
		...measurementBuildingResource,
		displayOptions: { show: { ...updateSingleShow, measurementScope: ['building'] } },
	},
	...parentSelectors(listShow, true),
	...parentSelectors(selectShow, false),
	...parentSelectors(updateSingleShow, false),
];

const measurementLocator = (show: Show): INodeProperties => ({
	...createResourceLocator({
		displayName: 'Measurement Point',
		name: 'measurementId',
		searchMethod: 'getMeasurementValues',
		listPlaceholder: 'Select a measurement point...',
		idPlaceholder: 'Enter a measurement point ID',
		displayOptions: { show },
	}),
	typeOptions: {
		loadOptionsDependsOn: [
			'measurementScope',
			'writeableOnly',
			'buildingId.value',
			'floorId.value',
			'spaceId.value',
			'deviceId.value',
			'deviceGroupId.value',
			'dataSetId.value',
		],
	},
});

export const measurementResource: INodeProperties = measurementLocator({
	operation: ['getById', 'getHistorical'],
	resource: ['measurementValue'],
});

const writeWarning =
	'Writes can reach physical equipment. Test on a designated test point first; BDP does not offer undo.';

export const measurementUpdateProperties: INodeProperties[] = [
	{
		displayName: writeWarning,
		name: 'updateWarning',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['measurementValue'], operation: ['update'] } },
	},
	{
		displayName: 'Mode',
		name: 'updateMode',
		type: 'options',
		options: [
			{ name: 'Single', value: 'single', description: 'Write one value to one measurement point per input item' },
			{
				name: 'Batch',
				value: 'batch',
				description: 'Write one value per input item to points in a device group, in one request',
			},
		],
		default: 'single',
		displayOptions: { show: { resource: ['measurementValue'], operation: ['update'] } },
	},
	measurementLocator(updateSingleShow),
	{
		displayName: 'Only Writeable Points',
		name: 'writeableOnly',
		type: 'boolean',
		default: true,
		displayOptions: { show: updateSingleShow },
		description: 'Whether the Measurement Point selector only lists points that accept writes',
	},
	{
		displayName: 'Value',
		name: 'pointValue',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: { show: updateSingleShow },
		description: 'The new numeric value to write to the measurement point',
	},
	...deviceGroupChain(updateBatchShow, true),
	{
		displayName: 'Measurement ID',
		name: 'batchMeasurementId',
		type: 'string',
		required: true,
		default: '={{ $json.measurementId }}',
		displayOptions: { show: updateBatchShow },
		description:
			'UUID of the measurement point for each input item. Points must belong to the selected device group.',
	},
	{
		displayName: 'Value',
		name: 'batchValue',
		type: 'number',
		required: true,
		// An expression default so each input item supplies its own value.
		// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-number
		default: '={{ $json.value }}',
		displayOptions: { show: updateBatchShow },
		description:
			'The new numeric value for each input item. Up to 500 points are sent per request; larger inputs are split into several requests.',
	},
];

export const measurementOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['measurementValue'] } },
	options: [
		{ name: 'Get Many', value: 'getAll', action: 'Get many measurement points' },
		{ name: 'Get', value: 'getById', action: 'Get a measurement point' },
		{
			name: 'Historical Values',
			value: 'getHistorical',
			action: 'Get measurement point history',
		},
		{ name: 'Update', value: 'update', action: 'Update a measurement point value' },
	],
	default: 'getAll',
};

const listFilter = (
	displayName: string,
	name: string,
	description: string,
	extra: Partial<INodeProperties> = {},
): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	displayOptions: { show: listShow },
	description,
	...extra,
});

export const measurementFilters: INodeProperties[] = [
	listFilter('Ontology Type', 'ontologyType', 'Filter measurement points by ontology type'),
	listFilter('Unit', 'unit', 'Filter measurement points by unit'),
	listFilter('Reference ID', 'referenceId', 'Filter measurement points by reference ID'),
	listFilter('Metadata', 'metadata', 'Filter measurement points by metadata'),
	listFilter('Context', 'context', 'Filter measurement points by context'),
	{
		displayName: 'Writeable',
		name: 'isWriteable',
		type: 'options',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Writeable Only', value: 'true' },
			{ name: 'Read-Only Only', value: 'false' },
		],
		default: '',
		displayOptions: { show: listShow },
		description: 'Only return measurement points that are (or are not) writeable',
	},
	listFilter(
		'Updated After',
		'updatedAfter',
		'Only return measurement points updated after this ISO 8601 timestamp with seconds and an explicit UTC offset or Z',
		{ placeholder: '2025-01-01T00:00:00Z' },
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
		description: 'Only return measurement points with this commissioned status',
	},
	listFilter('Order By', 'orderBy', 'Order measurement points by this field'),
];
