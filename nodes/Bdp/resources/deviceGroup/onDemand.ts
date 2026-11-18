import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { requiredId, type AggregateExecutor } from '../../shared/execution';
import { requestBdpWrite } from '../../shared/transport';
import { normalizePartialItems, type WriteItemStatus } from '../../shared/write';

// On-demand calls go straight to the source system, so a larger input is rejected
// instead of being split across requests or truncated.
export const ON_DEMAND_MAX_POINTS = 500;

type PointIdentity = { id: string } | { path: string };

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Each point is addressed by exactly one of id or path. */
function readIdentity(context: IExecuteFunctions, index: number): PointIdentity {
	const id = text(context.getNodeParameter('onDemandPointId', index, ''));
	const path = text(context.getNodeParameter('onDemandPointPath', index, ''));
	const label = `Input item ${index + 1}`;
	if (id && path) {
		throw new NodeOperationError(
			context.getNode(),
			`${label}: set either Point ID or Point Path, not both.`,
		);
	}
	if (!id && !path) {
		throw new NodeOperationError(context.getNode(), `${label}: a Point ID or a Point Path is required.`);
	}
	return id ? { id } : { path };
}

function identityKey(identity: { id?: string; path?: string }): string | undefined {
	if (identity.id) return `id:${identity.id}`;
	if (identity.path) return `path:${identity.path}`;
	return undefined;
}

function readValue(context: IExecuteFunctions, index: number): string {
	const value = context.getNodeParameter('onDemandValue', index, undefined);
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (typeof value === 'boolean') return String(value);
	if (typeof value === 'string') return value;
	throw new NodeOperationError(
		context.getNode(),
		`Input item ${index + 1}: Value is required and must be text, a number, or true/false.`,
	);
}

function readPoints(context: IExecuteFunctions, count: number) {
	if (count > ON_DEMAND_MAX_POINTS) {
		throw new NodeOperationError(
			context.getNode(),
			`On-demand requests are limited to ${ON_DEMAND_MAX_POINTS} points per run (received ${count}). Split the input; nothing was sent.`,
		);
	}
	const seen = new Set<string>();
	return Array.from({ length: count }, (_, index) => {
		const identity = readIdentity(context, index);
		const key = identityKey(identity)!;
		if (seen.has(key)) {
			throw new NodeOperationError(
				context.getNode(),
				`Input item ${index + 1}: this point appears more than once in the request.`,
			);
		}
		seen.add(key);
		return { index, identity };
	});
}

const always = () => true;

/** Set On Demand: writes one value per input item straight to the source system. Never retried. */
export const deviceGroupSetOnDemand: AggregateExecutor = {
	applies: always,
	async run(context, items) {
		const deviceGroupId = requiredId(context, 0, 'deviceGroupId', 'Device Group');
		const points = readPoints(context, items.length).map((point) => ({
			...point,
			value: readValue(context, point.index),
		}));
		const result = await requestBdpWrite.call(context, {
			resource: 'deviceGroup',
			operation: 'setOnDemand',
			method: 'POST',
			path: `/api/DeviceGroups/${encodeURIComponent(deviceGroupId)}/SetOnDemand`,
			body: points.map(({ identity, value }) => ({ identity, value })),
		});
		const failures = new Map<string, WriteItemStatus>();
		let confirmed = true;
		if (result.outcome === 'partial') {
			confirmed = result.items.length > 0;
			for (const failure of result.itemErrors) {
				const key = identityKey(failure);
				if (key) failures.set(key, failure);
			}
		}
		return points.map(({ index, identity, value }) => {
			const failure = failures.get(identityKey(identity)!);
			const base: IDataObject = { identity, value };
			if (failure) {
				return {
					pairedItem: index,
					json: {
						...base,
						status: 'failed',
						statusCode: failure.statusCode ?? 206,
						...(failure.errorCode ? { errorCode: failure.errorCode } : {}),
						error: failure.error ?? 'The point was rejected by the source system.',
					},
				};
			}
			if (!confirmed) {
				return {
					pairedItem: index,
					json: {
						...base,
						status: 'unconfirmed',
						statusCode: 206,
						error: 'BDP reported a partial result without per-point details; verify this point.',
					},
				};
			}
			return { pairedItem: index, json: { ...base, status: 'success', statusCode: result.statusCode } };
		});
	},
};

/** Get On Demand: reads live values from the source system for one point per input item. */
export const deviceGroupGetOnDemand: AggregateExecutor = {
	applies: always,
	async run(context, items) {
		const deviceGroupId = requiredId(context, 0, 'deviceGroupId', 'Device Group');
		const points = readPoints(context, items.length);
		const result = await requestBdpWrite.call(context, {
			resource: 'deviceGroup',
			operation: 'getOnDemand',
			method: 'POST',
			path: `/api/DeviceGroups/${encodeURIComponent(deviceGroupId)}/GetOnDemand`,
			body: points.map(({ identity }) => identity),
		});
		if (
			(result.outcome !== 'success' && result.outcome !== 'partial') ||
			!Array.isArray(result.data)
		) {
			throw new NodeOperationError(context.getNode(), 'BDP returned no live values for the requested points.');
		}
		const requested = new Map(points.map(({ index, identity }) => [identityKey(identity)!, index]));
		const statuses = normalizePartialItems(result.data);
		return (result.data as unknown[]).map((entry, position) => {
			const native = (
				typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? entry : { value: entry }
			) as IDataObject;
			const status = statuses[position];
			const key = identityKey(status);
			return {
				pairedItem: (key ? requested.get(key) : undefined) ?? 0,
				json: {
					...native,
					status: status.ok ? 'success' : 'failed',
					...(!status.ok
						? {
								...(status.errorCode ? { errorCode: status.errorCode } : {}),
								error: status.error ?? 'The point could not be read.',
							}
						: {}),
				},
			};
		});
	},
};
