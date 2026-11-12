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
import {
	buildingFilters,
	buildingOperation,
	buildingResource,
	buildingScopeProperties,
} from './resources/building/properties';
import { getOrganizations } from './resources/organization/listSearch';
import { executeOrganization } from './resources/organization/execute';
import {
	organizationFilters,
	organizationOperation,
	organizationResource,
} from './resources/organization/properties';
import { getSites } from './resources/site/listSearch';
import { executeSite } from './resources/site/execute';
import {
	siteFilters,
	siteGetOrganizationResource,
	siteOperation,
	siteOrganizationResource,
	siteResource,
} from './resources/site/properties';
import { executeMeasurementPoint } from './resources/measurementPoint/execute';
import {
	measurementBuildingResource,
	measurementFilters,
	measurementOperation,
	measurementResource,
} from './resources/measurementPoint/properties';
import { executeGraphql } from './resources/graphql/execute';
import { executeFloor } from './resources/floor/execute';
import { getFloors } from './resources/floor/listSearch';
import {
	floorBuildingResource,
	floorFilters,
	floorGetBuildingResource,
	floorOperation,
	floorPaginationProperties,
	floorResource,
} from './resources/floor/properties';
import { executeSpace } from './resources/space/execute';
import { getSpaces } from './resources/space/listSearch';
import {
	spaceCommissionedStatus,
	spaceFilters,
	spaceOperation,
	spacePaginationProperties,
	spaceResource,
	spaceScopeProperties,
} from './resources/space/properties';
import { executeSource } from './resources/source/execute';
import { getSources } from './resources/source/listSearch';
import {
	sourceFilters,
	sourceOperation,
	sourcePaginationProperties,
	sourceResource,
} from './resources/source/properties';
import { executeDevice } from './resources/device/execute';
import { getDevices } from './resources/device/listSearch';
import {
	deviceCommissionedStatus,
	deviceFilters,
	deviceOperation,
	devicePaginationProperties,
	deviceResource,
	deviceScopeProperties,
} from './resources/device/properties';
import { executeDeviceGroup } from './resources/deviceGroup/execute';
import { getDeviceGroups } from './resources/deviceGroup/listSearch';
import {
	deviceGroupFilters,
	deviceGroupOperation,
	deviceGroupPaginationProperties,
	deviceGroupResource,
	deviceGroupScopeProperties,
} from './resources/deviceGroup/properties';
import { executeDataSet } from './resources/dataSet/execute';
import { getDataSets } from './resources/dataSet/listSearch';
import {
	dataSetFilters,
	dataSetOperation,
	dataSetPaginationProperties,
	dataSetResource,
} from './resources/dataSet/properties';
import { executeEventHub } from './resources/eventHub/execute';
import { getEventHubs } from './resources/eventHub/listSearch';
import {
	eventHubFilters,
	eventHubOperation,
	eventHubPaginationProperties,
	eventHubResource,
} from './resources/eventHub/properties';
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
	organizationOperation,
	siteOperation,
	floorOperation,
	spaceOperation,
	sourceOperation,
	deviceOperation,
	deviceGroupOperation,
	dataSetOperation,
	eventHubOperation,
	measurementOperation,
	graphqlOperation,
	...graphqlProperties,
	...buildingScopeProperties,
	buildingResource,
	organizationResource,
	siteOrganizationResource,
	siteGetOrganizationResource,
	siteResource,
	floorBuildingResource,
	floorGetBuildingResource,
	floorResource,
	...spaceScopeProperties,
	spaceResource,
	sourceResource,
	...deviceScopeProperties,
	deviceResource,
	...deviceGroupScopeProperties,
	deviceGroupResource,
	dataSetResource,
	eventHubResource,
	measurementBuildingResource,
	measurementResource,
	nameFilter,
	...buildingFilters,
	...measurementFilters,
	...organizationFilters,
	...siteFilters,
	...floorFilters,
	...spaceFilters,
	spaceCommissionedStatus,
	...sourceFilters,
	...deviceFilters,
	deviceCommissionedStatus,
	...deviceGroupFilters,
	...dataSetFilters,
	...eventHubFilters,
	...historyProperties,
	...paginationProperties,
	...floorPaginationProperties,
	...spacePaginationProperties,
	...sourcePaginationProperties,
	...devicePaginationProperties,
	...deviceGroupPaginationProperties,
	...dataSetPaginationProperties,
	...eventHubPaginationProperties,
];

const resourceExecutors: Record<
	string,
	(context: IExecuteFunctions, itemIndex: number, operation: string) => Promise<IDataObject[]>
> = {
	building: executeBuilding,
	organization: executeOrganization,
	site: executeSite,
	floor: executeFloor,
	space: executeSpace,
	source: executeSource,
	device: executeDevice,
	deviceGroup: executeDeviceGroup,
	dataSet: executeDataSet,
	eventHub: executeEventHub,
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
			getOrganizations,
			getSites,
			getFloors,
			getSpaces,
			getSources,
			getDevices,
			getDeviceGroups,
			getDataSets,
			getEventHubs,
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
