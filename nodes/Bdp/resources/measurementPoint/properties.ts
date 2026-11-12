import type { INodeProperties } from 'n8n-workflow';

import { buildingResource } from '../building/properties';
import { createResourceLocator } from '../../shared/locator';

export const measurementBuildingResource: INodeProperties = {
	...buildingResource,
	required: false,
	displayOptions: {
		show: {
			operation: ['getAll', 'getHistorical'],
			resource: ['measurementValue'],
		},
	},
};

export const measurementResource: INodeProperties = createResourceLocator({
	displayName: 'Measurement Point',
	name: 'measurementId',
	searchMethod: 'getMeasurementValues',
	listPlaceholder: 'Select a measurement point...',
	idPlaceholder: 'Enter a measurement point ID',
	displayOptions: {
		show: {
			operation: ['getHistorical'],
			resource: ['measurementValue'],
		},
	},
});

export const measurementOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['measurementValue'] } },
	options: [
		{ name: 'Get Many', value: 'getAll', action: 'List measurement points' },
		{
			name: 'Historical Values',
			value: 'getHistorical',
			action: 'Get measurement point history',
		},
	],
	default: 'getAll',
};

export const measurementFilters: INodeProperties[] = [
	{
		displayName: 'Ontology Type',
		name: 'ontologyType',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['measurementValue'], operation: ['getAll'] },
		},
		description: 'Filter measurement points by ontology type',
	},
	{
		displayName: 'Unit',
		name: 'unit',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['measurementValue'], operation: ['getAll'] },
		},
		description: 'Filter measurement points by unit',
	},
];
