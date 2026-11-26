import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	type AggregateExecutor,
	historyFilters,
	pagination,
	requiredId,
	unsupported,
} from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { normalizeTimestamp } from '../../shared/time';
import { getBdpRequest, requestBdpWrite } from '../../shared/transport';
import {
	buildReplacePatch,
	patchValue,
	requireUuid,
	type WriteItemStatus,
} from '../../shared/write';

// Each scope's parent route and the parameter that holds its resource locator.
export const measurementScopes: Record<string, { path: string; parameter: string; label: string }> =
	{
		building: { path: 'Buildings', parameter: 'buildingId', label: 'Building' },
		floor: { path: 'Floors', parameter: 'floorId', label: 'Floor' },
		space: { path: 'Spaces', parameter: 'spaceId', label: 'Space' },
		device: { path: 'Devices', parameter: 'deviceId', label: 'Device' },
		deviceGroup: { path: 'DeviceGroups', parameter: 'deviceGroupId', label: 'Device Group' },
		dataSet: { path: 'DataSets', parameter: 'dataSetId', label: 'Data Set' },
	};

export async function executeMeasurementPoint(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const request = getBdpRequest(context);
	if (operation === 'getById') {
		const id = requiredId(context, itemIndex, 'measurementId', 'Measurement point');
		const response = await request(`/api/MeasurementValues/${encodeURIComponent(id)}`, {});
		if (
			typeof response.data !== 'object' ||
			response.data === null ||
			Array.isArray(response.data)
		) {
			throw new NodeOperationError(
				context.getNode(),
				'BDP returned an invalid measurement-point detail response.',
			);
		}
		return [response.data as IDataObject];
	}
	if (operation === 'update') {
		// Batch mode runs once over all items (measurementBatchUpdate), never per item.
		if (context.getNodeParameter('updateMode', itemIndex, 'single') !== 'single') {
			return unsupported(context);
		}
		return updateSingle(context, itemIndex);
	}
	const page = pagination(context, itemIndex);
	if (operation === 'getAll') {
		const scope = context.getNodeParameter('measurementScope', itemIndex, 'building') as string;
		if (!Object.prototype.hasOwnProperty.call(measurementScopes, scope)) {
			throw new NodeOperationError(context.getNode(), 'Choose a supported measurement-point scope.');
		}
		const { parameter, label } = measurementScopes[scope];
		const id = requiredId(context, itemIndex, parameter, label);
		const filters: IDataObject = {};
		for (const name of [
			'name',
			'ontologyType',
			'unit',
			'referenceId',
			'metadata',
			'context',
			'commissionedStatus',
			'orderBy',
		]) {
			const value = context.getNodeParameter(name, itemIndex, '') as string;
			if (value) filters[name] = value;
		}
		const isWriteable = context.getNodeParameter('isWriteable', itemIndex, '') as string;
		if (isWriteable === 'true' || isWriteable === 'false') filters.isWriteable = isWriteable === 'true';
		const updatedAfter = context.getNodeParameter('updatedAfter', itemIndex, '') as string;
		if (updatedAfter) filters.updatedAfter = normalizeTimestamp(updatedAfter, 'Updated After');
		return fetchScopedList(request, {
			scope,
			scopePaths: Object.fromEntries(Object.entries(measurementScopes).map(([k, v]) => [k, v.path])),
			parentId: id,
			child: 'MeasurementValues',
			filters,
			...page,
		});
	}
	if (operation === 'getHistorical') {
		const id = requiredId(context, itemIndex, 'measurementId', 'Measurement point');
		return fetchScopedList(request, {
			scope: 'measurementPoint',
			scopePaths: { measurementPoint: 'MeasurementValue' },
			parentId: id,
			child: 'HistoricalValues',
			filters: historyFilters(context, itemIndex),
			...page,
		});
	}
	return unsupported(context);
}

const MEASUREMENT_PATCH = { '/value': patchValue.finiteNumber('Value') };

// The API limit is confirmed in UAT; until then larger inputs are split into sequential
// requests of this size rather than truncated or sent in one oversized request.
export const MEASUREMENT_BATCH_SIZE = 500;

async function updateSingle(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const id = requiredId(context, itemIndex, 'measurementId', 'Measurement point');
	const patch = buildReplacePatch(
		[{ path: '/value', value: context.getNodeParameter('pointValue', itemIndex) }],
		MEASUREMENT_PATCH,
	);
	const result = await requestBdpWrite.call(context, {
		resource: 'measurementValue',
		operation: 'update',
		method: 'PATCH',
		path: `/api/MeasurementValues/${encodeURIComponent(id)}`,
		body: patch,
		jsonPatch: true,
	});
	return [
		{
			measurementId: id,
			value: patch[0].value as number,
			status: 'success',
			statusCode: result.statusCode,
		},
	];
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
	return chunks;
}

/** Batch update: one input item per point, one PATCH per device group (chunked). */
export const measurementBatchUpdate: AggregateExecutor = {
	applies: (context) => context.getNodeParameter('updateMode', 0, 'single') === 'batch',
	async run(context, items) {
		// Validate every item before any credential lookup or request.
		const entries = items.map((_, index) => {
			const label = `Input item ${index + 1}`;
			const deviceGroupId = requiredId(context, index, 'deviceGroupId', 'Device Group');
			let measurementId: string;
			try {
				measurementId = requireUuid(
					context.getNodeParameter('batchMeasurementId', index),
					'Measurement ID',
				);
			} catch (error) {
				throw new NodeOperationError(context.getNode(), `${label}: ${(error as Error).message}`);
			}
			let patch;
			try {
				patch = buildReplacePatch(
					[{ path: '/value', value: context.getNodeParameter('batchValue', index) }],
					MEASUREMENT_PATCH,
				);
			} catch (error) {
				throw new NodeOperationError(context.getNode(), `${label}: ${(error as Error).message}`);
			}
			return { index, deviceGroupId, measurementId, patch };
		});
		if (new Set(entries.map((entry) => entry.deviceGroupId)).size > 1) {
			throw new NodeOperationError(
				context.getNode(),
				'Batch update sends one device group per run; all input items must use the same Device Group.',
			);
		}
		const seen = new Set<string>();
		for (const { index, measurementId } of entries) {
			const normalized = measurementId.toLowerCase();
			if (seen.has(normalized)) {
				throw new NodeOperationError(
					context.getNode(),
					`Input item ${index + 1}: Measurement ID ${measurementId} appears more than once in the batch.`,
				);
			}
			seen.add(normalized);
		}

		const deviceGroupId = entries[0].deviceGroupId;
		const path = `/api/DeviceGroups/${encodeURIComponent(deviceGroupId)}/MeasurementValues`;
		const chunks = chunk(entries, MEASUREMENT_BATCH_SIZE);
		const records: Array<{ json: IDataObject; pairedItem: number }> = [];

		for (const [chunkIndex, group] of chunks.entries()) {
			let result;
			try {
				result = await requestBdpWrite.call(context, {
					resource: 'measurementValue',
					operation: 'update',
					method: 'PATCH',
					path,
					body: {
						patches: group.map(({ measurementId, patch }) => ({ measurementId, patch })),
					},
					jsonPatch: true,
				});
			} catch (error) {
				const applied = chunkIndex * MEASUREMENT_BATCH_SIZE;
				const message = (error as Error).message;
				throw new NodeOperationError(
					context.getNode(),
					chunkIndex === 0
						? message
						: `${message} Request ${chunkIndex + 1} of ${chunks.length} failed after the first ${applied} points were already sent.`,
				);
			}
			const failures = new Map<string, WriteItemStatus>();
			let confirmed = true;
			if (result.outcome === 'partial') {
				confirmed = result.items.length > 0;
				for (const failure of result.itemErrors) {
					if (failure.id) failures.set(failure.id.toLowerCase(), failure);
				}
			}
			for (const { index, measurementId, patch } of group) {
				const failure = failures.get(measurementId.toLowerCase());
				const base = { measurementId, value: patch[0].value as number };
				if (failure) {
					records.push({
						pairedItem: index,
						json: {
							...base,
							status: 'failed',
							statusCode: failure.statusCode ?? 206,
							...(failure.errorCode ? { errorCode: failure.errorCode } : {}),
							error: failure.error ?? 'The point was rejected by BDP.',
						},
					});
				} else if (!confirmed) {
					records.push({
						pairedItem: index,
						json: {
							...base,
							status: 'unconfirmed',
							statusCode: 206,
							error: 'BDP reported a partial result without per-point details; verify this point.',
						},
					});
				} else {
					records.push({
						pairedItem: index,
						json: { ...base, status: 'success', statusCode: result.statusCode },
					});
				}
			}
		}
		return records;
	},
};
