import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { historyFilters, pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { normalizeTimestamp } from '../../shared/time';
import { getBdpRequest } from '../../shared/transport';

// Each scope's parent route and the parameter that holds its resource locator.
export const measurementScopes: Record<string, { path: string; parameter: string; label: string }> =
	{
		building: { path: 'Buildings', parameter: 'buildingId', label: 'Building' },
		floor: { path: 'Floors', parameter: 'floorId', label: 'Floor' },
		space: { path: 'Spaces', parameter: 'spaceId', label: 'Space' },
		device: { path: 'Devices', parameter: 'deviceId', label: 'Device' },
		deviceGroup: { path: 'DeviceGroups', parameter: 'deviceGroupId', label: 'Device Group' },
		dataSet: { path: 'DataSets', parameter: 'dataSetId', label: 'Data Set' },
	};

export async function executeMeasurementPoint(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'measurementId', 'Measurement point');
		const response = await request(`/api/MeasurementValues/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid measurement-point detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	const page = pagination(context, itemIndex);
	if (operation === 'getAll') {
		const scope = context.getNodeParameter('measurementScope', itemIndex, 'building') as string;
		if (!Object.prototype.hasOwnProperty.call(measurementScopes, scope)) {
			throw new NodeOperationError(context.getNode(), 'Choose a supported measurement-point scope.');
		}
		const { parameter, label } = measurementScopes[scope];
		const id = requiredId(context, itemIndex, parameter, label);
		const filters: IDataObject = {};
		for (const name of [
			'name',
			'ontologyType',
			'unit',
			'referenceId',
			'metadata',
			'context',
			'commissionedStatus',
			'orderBy',
		]) {
			const value = context.getNodeParameter(name, itemIndex, '') as string;
			if (value) filters[name] = value;
		}
		const isWriteable = context.getNodeParameter('isWriteable', itemIndex, '') as string;
		if (isWriteable === 'true' || isWriteable === 'false') filters.isWriteable = isWriteable === 'true';
		const updatedAfter = context.getNodeParameter('updatedAfter', itemIndex, '') as string;
		if (updatedAfter) filters.updatedAfter = normalizeTimestamp(updatedAfter, 'Updated After');
		return fetchScopedList(request, {
			scope,
			scopePaths: Object.fromEntries(Object.entries(measurementScopes).map(([k, v]) => [k, v.path])),
			parentId: id,
			child: 'MeasurementValues',
			filters,
			...page,
		});
	}
	if (operation === 'getHistorical') {
		const id = requiredId(context, itemIndex, 'measurementId', 'Measurement point');
		return fetchScopedList(request, {
			scope: 'measurementPoint',
			scopePaths: { measurementPoint: 'MeasurementValue' },
			parentId: id,
			child: 'HistoricalValues',
			filters: historyFilters(context, itemIndex),
			...page,
		});
	}
	return unsupported(context);
}
