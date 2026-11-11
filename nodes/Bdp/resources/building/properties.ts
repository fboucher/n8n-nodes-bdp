import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from '../../shared/locator';

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
