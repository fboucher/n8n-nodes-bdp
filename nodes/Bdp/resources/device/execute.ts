import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { getBdpRequest } from '../../shared/transport';

const scopes: Record<string, { path: string; parameter: string; label: string }> = {
	building: { path: 'Buildings', parameter: 'buildingId', label: 'Building' },
	floor: { path: 'Floors', parameter: 'floorId', label: 'Floor' },
	space: { path: 'Spaces', parameter: 'spaceId', label: 'Space' },
	source: { path: 'Sources', parameter: 'sourceId', label: 'Source' },
};

export async function executeDevice(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const scope = context.getNodeParameter('deviceScope', itemIndex, 'building') as string;
		if (!Object.prototype.hasOwnProperty.call(scopes, scope)) {
			throw new NodeOperationError(context.getNode(), 'Choose a supported device scope.');
		}
		const { parameter, label } = scopes[scope];
		const parentId = requiredId(context, itemIndex, parameter, label);
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		for (const key of [
			'name',
			'metadata',
			'referenceId',
			'ontologyType',
			'productType',
			'vendorIdentifier',
			'commissionedStatus',
			'orderBy',
		]) {
			const value = context.getNodeParameter(key, itemIndex, '') as string;
			if (value !== '') filters[key] = value;
		}
		return fetchScopedList(request, {
			scope,
			scopePaths: Object.fromEntries(Object.entries(scopes).map(([k, v]) => [k, v.path])),
			parentId,
			child: 'Devices',
			filters,
			...page,
		});
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'deviceId', 'Device');
		const response = await request(`/api/Devices/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid device detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
