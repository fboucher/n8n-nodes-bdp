import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { historyFilters, pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { fetchAllPages, getBdpRequest } from '../../shared/transport';

export async function executeBuilding(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const page = pagination(context, itemIndex, operation === 'getAll');
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const name = context.getNodeParameter('name', itemIndex, '') as string;
		return fetchAllPages(request, '/api/Buildings', name ? { name } : {}, page);
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'buildingId', 'Building');
		const response = await request(`/api/Buildings/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid building detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	if (operation === 'getHistorical') {
		const id = requiredId(context, itemIndex, 'buildingId', 'Building');
		return fetchScopedList(request, {
			scope: 'building',
			scopePaths: { building: 'Buildings' },
			parentId: id,
			child: 'HistoricalValues',
			filters: historyFilters(context, itemIndex),
			...page,
		});
	}
	return unsupported(context);
}
