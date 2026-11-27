import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest, requestBdpWrite } from '../../shared/transport';
import { buildReplacePatch, patchValue, type PatchValidator } from '../../shared/write';
import { redactEventHub } from './redact';

// List and Get are GET-only; Update is the only write (PATCH /api/EventHubs/{id}).
// Credential-like fields in every returned record, including the Update response, are redacted (see redact.ts).

const consumerGroups: PatchValidator = (value) => {
	let list = value;
	if (typeof value === 'string') {
		list = value
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean);
		if ((list as string[]).length === 0) {
			throw new Error('Consumer Groups must list at least one name.');
		}
	}
	return patchValue.stringArray('Consumer Groups')(list);
};

const EVENT_HUB_PATCH_PATHS: Record<string, PatchValidator> = {
	'/partitionCount': patchValue.integer('Partition Count'),
	'/retentionPolicy': patchValue.nonEmptyString('Retention Policy'),
	'/consumerGroups': consumerGroups,
	'/telemetryPayloadFormat': patchValue.nonEmptyString('Telemetry Payload Format'),
};
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
	if (operation === 'update') {
		const id = requiredId(context, itemIndex, 'eventHubId', 'Event Hub');
		const fields = context.getNodeParameter('eventHubUpdateFields', itemIndex, {}) as IDataObject;
		const patch = buildReplacePatch(
			['partitionCount', 'retentionPolicy', 'consumerGroups', 'telemetryPayloadFormat']
				.filter((field) => Object.prototype.hasOwnProperty.call(fields, field))
				.map((field) => ({ path: `/${field}`, value: fields[field] })),
			EVENT_HUB_PATCH_PATHS,
		);
		const result = await requestBdpWrite.call(context, {
			resource: 'eventHub',
			operation: 'update',
			method: 'PATCH',
			path: `/api/EventHubs/${encodeURIComponent(id)}`,
			body: patch,
			jsonPatch: true,
		});
		if (
			result.outcome === 'success' &&
			typeof result.data === 'object' &&
			result.data !== null &&
			!Array.isArray(result.data)
		) {
			return [redactEventHub(result.data as IDataObject)];
		}
		return [{ id, status: 'updated', statusCode: result.statusCode }];
	}
	return unsupported(context);
}
