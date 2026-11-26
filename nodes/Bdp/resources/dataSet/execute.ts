import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchAllPages, getBdpRequest, requestBdpWrite } from '../../shared/transport';
import { buildReplacePatch, type WriteResult } from '../../shared/write';
import { DATA_SET_PATCH_PATHS, validateExpiresOn, validateMembers, validateName } from './validate';

// List and Get are GET-only. Create, Update and Delete are the only writes (see shared/writeAllowlist.ts).

function recordOrStatus(result: WriteResult, fallback: IDataObject): IDataObject {
	if (
		result.outcome === 'success' &&
		typeof result.data === 'object' &&
		result.data !== null &&
		!Array.isArray(result.data)
	) {
		return result.data as IDataObject;
	}
	// The write succeeded but BDP returned no record; say so instead of failing after the fact.
	return { ...fallback, statusCode: result.statusCode };
}
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
		const id = requiredId(context, itemIndex, 'dataSetId', 'Dataset');
		const response = await request(`/api/DataSets/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid dataset detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	if (operation === 'create') {
		const body = {
			name: validateName(context.getNodeParameter('dataSetName', itemIndex, '')),
			expiresOn: validateExpiresOn(context.getNodeParameter('dataSetExpiresOn', itemIndex, '')),
			members: validateMembers(context.getNodeParameter('dataSetMembers', itemIndex, '{}')),
		};
		// Never retried: a repeated create could make a second data set.
		const result = await requestBdpWrite.call(context, {
			resource: 'dataSet',
			operation: 'create',
			method: 'POST',
			path: '/api/DataSets',
			body,
		});
		return [recordOrStatus(result, { name: body.name as string, status: 'created' })];
	}
	if (operation === 'update') {
		const id = requiredId(context, itemIndex, 'dataSetId', 'Dataset');
		const fields = context.getNodeParameter('dataSetUpdateFields', itemIndex, {}) as IDataObject;
		const changes = ['name', 'expiresOn', 'members']
			.filter((field) => Object.prototype.hasOwnProperty.call(fields, field))
			.map((field) => ({ path: `/${field}`, value: fields[field] }));
		const patch = buildReplacePatch(changes, DATA_SET_PATCH_PATHS);
		const result = await requestBdpWrite.call(context, {
			resource: 'dataSet',
			operation: 'update',
			method: 'PATCH',
			path: `/api/DataSets/${encodeURIComponent(id)}`,
			body: patch,
			jsonPatch: true,
		});
		return [recordOrStatus(result, { id, status: 'updated' })];
	}
	if (operation === 'delete') {
		const id = requiredId(context, itemIndex, 'dataSetId', 'Dataset');
		const result = await requestBdpWrite.call(context, {
			resource: 'dataSet',
			operation: 'delete',
			method: 'DELETE',
			path: `/api/DataSets/${encodeURIComponent(id)}`,
		});
		return [{ id, status: 'deleted', statusCode: result.statusCode }];
	}
	return unsupported(context);
}
