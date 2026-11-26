import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest, requestBdpWrite } from '../../shared/transport';

// List and Get are GET-only. Run On Demand is the only write: POST /api/Sources/{id}/OnDemand/{method}.
// The payload is source- and method-specific and is passed through without validation.

function hasControlCharacter(value: string): boolean {
	return [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function parsePayload(context: IExecuteFunctions, value: unknown): unknown {
	if (typeof value !== 'string') return value ?? {};
	if (!value.trim()) return {};
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
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
	if (operation === 'runOnDemand') {
		const id = requiredId(context, itemIndex, 'sourceId', 'Source');
		const method = String(context.getNodeParameter('onDemandMethod', itemIndex, '')).trim();
		if (!method || /^\.+$/.test(method) || hasControlCharacter(method)) {
			throw new NodeOperationError(context.getNode(), 'A valid On Demand method name is required.');
		}
		const payload = parsePayload(context, context.getNodeParameter('onDemandPayload', itemIndex, '{}'));
		if (payload === undefined) {
			throw new NodeOperationError(context.getNode(), 'Payload must be valid JSON.');
		}
		// Never retried: a repeat after an ambiguous failure could repeat a physical action.
		const result = await requestBdpWrite.call(context, {
			resource: 'source',
			operation: 'runOnDemand',
			method: 'POST',
			path: `/api/Sources/${encodeURIComponent(id)}/OnDemand/${encodeURIComponent(method)}`,
			body: payload,
		});
		if (result.outcome === 'success') {
			return [
				typeof result.data === 'object' && result.data !== null && !Array.isArray(result.data)
					? (result.data as IDataObject)
					: { response: result.data as IDataObject },
			];
		}
		return [{ status: 'success', statusCode: result.statusCode }];
	}
	return unsupported(context);
}
