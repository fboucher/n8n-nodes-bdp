import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { getBdpRequest } from '../../shared/transport';

export async function executeFloor(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const buildingId = requiredId(context, itemIndex, 'buildingId', 'Building');
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		for (const key of [
			'name',
			'referenceId',
			'metadata',
			'spaceCount',
			'measurementCount',
			'orderBy',
		]) {
			const value = context.getNodeParameter(key, itemIndex, '') as string | number;
			if (value !== '') filters[key] = value;
		}
		return fetchScopedList(request, {
			scope: 'building',
			scopePaths: { building: 'Buildings' },
			parentId: buildingId,
			child: 'Floors',
			filters,
			...page,
		});
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'floorId', 'Floor');
		const response = await request(`/api/Floors/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(context.getNode(), 'BDP returned an invalid floor detail response.');
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
