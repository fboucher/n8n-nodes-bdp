import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest } from '../../shared/transport';

// Read-only: only GET /api/DataSets and GET /api/DataSets/{id}. Create, update and delete are intentionally not supported.
export async function executeDataSet(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const page = pagination(context, itemIndex);
		const filters: IDataObject = {};
		for (const key of ['name', 'orderBy']) {
			const value = context.getNodeParameter(key, itemIndex, '') as string;
			if (value !== '') filters[key] = value;
		}
		return fetchAllPages(request, '/api/DataSets', filters, page);
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'dataSetId', 'Data Set');
		const response = await request(`/api/DataSets/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid data set detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	return unsupported(context);
}
