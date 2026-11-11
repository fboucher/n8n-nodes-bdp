import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest } from '../../shared/transport';

export async function executeOrganization(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		const name = context.getNodeParameter('name', itemIndex, '') as string;
		const siteCount = context.getNodeParameter('siteCount', itemIndex, '') as number | string;
		const orderBy = context.getNodeParameter('orderBy', itemIndex, '') as string;
		if (name) filters.name = name;
		if (siteCount !== '') filters.siteCount = siteCount;
		if (orderBy) filters.orderBy = orderBy;
		return fetchAllPages(request, '/api/Organizations', filters, page);
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'organizationId', 'Organization');
		const response = await request(`/api/Organizations/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid organization detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
