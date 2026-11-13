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
		const scope = context.getNodeParameter('scope', itemIndex, 'all') as string;
		const filters: IDataObject = {};
		for (const key of [
			'name',
			'referenceId',
			'metadata',
			'floorCount',
			'spaceCount',
			'measurementCount',
			'orderBy',
		]) {
			const value = context.getNodeParameter(key, itemIndex, '') as string | number;
			if (value !== '') filters[key] = value;
		}
		if (context.getNodeParameter('includeCounts', itemIndex, false)) filters.includeCounts = true;
		if (scope === 'all') return fetchAllPages(request, '/api/Buildings', filters, page);
		if (scope === 'organization' || scope === 'site') {
			const label = scope === 'organization' ? 'Organization' : 'Site';
			const parentId = requiredId(context, itemIndex, `${scope}Id`, label);
			return fetchScopedList(request, {
				scope,
				scopePaths: { organization: 'Organizations', site: 'Sites' },
				parentId,
				child: 'Buildings',
				filters,
				...page,
			});
		}
		throw new NodeOperationError(context.getNode(), 'Choose a supported building scope.');
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'buildingId', 'Building');
		const includeCounts = context.getNodeParameter('includeCounts', itemIndex, false) as boolean;
		const response = await request(
			`/api/Buildings/${encodeURIComponent(id)}`,
			includeCounts ? { includeCounts: true } : {},
		);
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
