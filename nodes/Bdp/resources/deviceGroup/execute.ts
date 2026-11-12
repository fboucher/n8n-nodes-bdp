import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { normalizeTimestamp } from '../../shared/time';
import { getBdpRequest } from '../../shared/transport';

const scopes: Record<string, { path: string; parameter: string; label: string }> = {
	building: { path: 'Buildings', parameter: 'buildingId', label: 'Building' },
	source: { path: 'Sources', parameter: 'sourceId', label: 'Source' },
};

// Read-only: only GET requests. The GetOnDemand / SetOnDemand POST endpoints are
// intentionally not supported.
export async function executeDeviceGroup(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const scope = context.getNodeParameter('deviceGroupScope', itemIndex, 'building') as string;
		if (!Object.prototype.hasOwnProperty.call(scopes, scope)) {
			throw new NodeOperationError(context.getNode(), 'Choose a supported device group scope.');
		}
		const { parameter, label } = scopes[scope];
		const parentId = requiredId(context, itemIndex, parameter, label);
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		for (const key of ['referenceId', 'metadata', 'commissionedStatus', 'orderBy']) {
			const value = context.getNodeParameter(key, itemIndex, '') as string;
			if (value !== '') filters[key] = value;
		}
		const timestamps: Array<[string, string]> = [
			['commissionedBefore', 'Commissioned Before'],
			['decommissionedAfter', 'Decommissioned After'],
		];
		for (const [key, fieldName] of timestamps) {
			const value = context.getNodeParameter(key, itemIndex, '') as string;
			if (value !== '') filters[key] = normalizeTimestamp(value, fieldName);
		}
		return fetchScopedList(request, {
			scope,
			scopePaths: Object.fromEntries(Object.entries(scopes).map(([k, v]) => [k, v.path])),
			parentId,
			child: 'DeviceGroups',
			filters,
			...page,
		});
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'deviceGroupId', 'Device Group');
		const response = await request(`/api/DeviceGroups/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid device group detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
