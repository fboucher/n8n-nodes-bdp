import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest } from '../../shared/transport';

// Read-only: only GET /api/Sources and GET /api/Sources/{id}. The on-demand
// command endpoint (POST /api/Sources/{id}/OnDemand/{method}) is intentionally not supported.
export async function executeSource(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		for (const key of ['type', 'name', 'orderBy']) {
			const value = context.getNodeParameter(key, itemIndex, '') as string;
			if (value !== '') filters[key] = value;
		}
		return fetchAllPages(request, '/api/Sources', filters, page);
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'sourceId', 'Source');
		const response = await request(`/api/Sources/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid source detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
