import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { fetchAllPages, getBdpRequest } from '../../shared/transport';

export async function executeSite(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const page = pagination(context, itemIndex);
		const scope = context.getNodeParameter('scope', itemIndex, 'all') as string;
		const filters: IDataObject = {};
		const name = context.getNodeParameter('name', itemIndex, '') as string;
		const metadata = context.getNodeParameter('metadata', itemIndex, '') as string;
		const buildingCount = context.getNodeParameter(
			'buildingCount',
			itemIndex,
			'',
		) as number | string;
		const orderBy = context.getNodeParameter('orderBy', itemIndex, '') as string;
		if (name) filters.name = name;
		if (metadata) filters.metadata = metadata;
		if (buildingCount !== '') filters.buildingCount = buildingCount;
		if (orderBy) filters.orderBy = orderBy;
		if (scope === 'all') return fetchAllPages(request, '/api/Sites', filters, page);
		if (scope === 'organization') {
			const organizationId = requiredId(
				context,
				itemIndex,
				'organizationId',
				'Organization',
			);
			return fetchScopedList(request, {
				scope: 'organization',
				scopePaths: { organization: 'Organizations' },
				parentId: organizationId,
				child: 'Sites',
				filters,
				...page,
			});
		}
		throw new NodeOperationError(context.getNode(), 'Choose a supported site scope.');
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'siteId', 'Site');
		const response = await request(`/api/Sites/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(context.getNode(), 'BDP returned an invalid site detail response.');
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
