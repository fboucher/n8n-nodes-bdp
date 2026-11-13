import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { fetchHistoricalValues } from '../../shared/history';
import { getBdpRequest } from '../../shared/transport';

export async function executeSpace(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const scope = context.getNodeParameter('spaceScope', itemIndex, 'building') as string;
		if (scope !== 'building' && scope !== 'floor') {
			throw new NodeOperationError(context.getNode(), 'Choose a supported space scope.');
		}
		const parentId =
			scope === 'building'
				? requiredId(context, itemIndex, 'buildingId', 'Building')
				: requiredId(context, itemIndex, 'floorId', 'Floor');
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		for (const key of [
			'name',
			'referenceId',
			'metadata',
			'ontologyType',
			'measurementCount',
			'commissionedStatus',
			'orderBy',
		]) {
			const value = context.getNodeParameter(key, itemIndex, '') as string | number;
			if (value !== '') filters[key] = value;
		}
		return fetchScopedList(request, {
			scope,
			scopePaths: { building: 'Buildings', floor: 'Floors' },
			parentId,
			child: 'Spaces',
			filters,
			...page,
		});
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'spaceId', 'Space');
		const response = await request(`/api/Spaces/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid space detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	if (operation === 'getHistorical') {
		return fetchHistoricalValues(context, itemIndex, {
			path: 'Spaces',
			parameter: 'spaceId',
			label: 'Space',
		});
	}
	return unsupported(context);
}
