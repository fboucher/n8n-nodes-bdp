import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { getBuildings } from './resources/building/listSearch';
import { getMeasurementValues } from './resources/measurementPoint/listSearch';
import { executeBuilding } from './resources/building/execute';
import { buildingOperation, buildingResource } from './resources/building/properties';
import { executeMeasurementPoint } from './resources/measurementPoint/execute';
import {
	measurementBuildingResource,
	measurementFilters,
	measurementOperation,
	measurementResource,
} from './resources/measurementPoint/properties';
import { executeGraphql } from './resources/graphql/execute';
import { graphqlOperation, graphqlProperties } from './resources/graphql/properties';
import {
	historyProperties,
	nameFilter,
	paginationProperties,
	resourceProperty,
} from './shared/properties';

const properties: INodeProperties[] = [
	resourceProperty,
	buildingOperation,
	measurementOperation,
	graphqlOperation,
	...graphqlProperties,
	buildingResource,
	measurementBuildingResource,
	measurementResource,
	nameFilter,
	...measurementFilters,
	...historyProperties,
	...paginationProperties,
];

const resourceExecutors: Record<
	string,
	(context: IExecuteFunctions, itemIndex: number, operation: string) => Promise<IDataObject[]>
> = {
	building: executeBuilding,
	measurementValue: executeMeasurementPoint,
	graphql: executeGraphql,
};

export class Bdp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Building Data Platform',
		name: 'bdp',
		icon: { light: 'file:../../icons/bdp.svg', dark: 'file:../../icons/bdp.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Community-maintained, read-only operations for Schneider Electric BDP.',
		defaults: { name: 'Building Data Platform' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'bdpOAuth2Api', required: true }],
		properties,
	};

	methods = {
		listSearch: {
			getBuildings,
			getMeasurementValues,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputItems = this.getInputData();
		const output: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const executeResource = Object.prototype.hasOwnProperty.call(resourceExecutors, resource)
					? resourceExecutors[resource]
					: undefined;
				if (!executeResource)
					throw new NodeOperationError(this.getNode(), 'This BDP operation is not supported.');
				const records = await executeResource(this, itemIndex, operation);
				for (const record of records) {
					output.push({ json: record, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				const nodeError = new NodeOperationError(this.getNode(), error as Error, { itemIndex });
				if (!this.continueOnFail()) throw nodeError;
				output.push({
					json: { error: nodeError.message },
					error: nodeError,
					pairedItem: { item: itemIndex },
				});
			}
		}

		return [output];
	}
}
