import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest } from '../../shared/transport';
import { redactEventHub } from './redact';

// Read-only: only GET /api/EventHubs and GET /api/EventHubs/{id}. The PATCH endpoint is intentionally not supported.
// Credential-like fields in returned records are redacted (see redact.ts).
export async function executeEventHub(
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
		return (await fetchAllPages(request, '/api/EventHubs', filters, page)).map(redactEventHub);
	}
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'eventHubId', 'Event Hub');
		const response = await request(`/api/EventHubs/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid event hub detail response.',
			);
		}
		return [redactEventHub(response.data as IDataObject)];
	}
	return unsupported(context);
}
