import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { unsupported, type AggregateExecutor } from '../../shared/execution';
import { normalizeTimestamp } from '../../shared/time';
import { requestBdpIngress } from '../../shared/transport';
import { requireUuid } from '../../shared/write';

// Per-message size the platform recommends. Larger inputs are split into several messages;
// a single point that cannot fit is rejected instead of being truncated.
export const MAX_MESSAGE_BYTES = 4096;
// The platform allows 200 messages per second per device; one run never sends more than this.
export const MAX_MESSAGES_PER_RUN = 200;

type Scalar = boolean | number | string;

const byteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

function toNumber(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value === 'string' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value.trim())) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

/** Applies the chosen value type; every result is boolean, integer, number, string or a UTC date-time. */
function coerceValue(valueType: string, value: unknown): Scalar {
	switch (valueType) {
		case 'auto':
			if (typeof value === 'boolean' || typeof value === 'string') return value;
			if (typeof value === 'number' && Number.isFinite(value)) return value;
			throw new Error('Value must be a boolean, a finite number, or text.');
		case 'string':
			if (typeof value === 'string') return value;
			if (typeof value === 'number' || typeof value === 'boolean') return String(value);
			throw new Error('Value must be text.');
		case 'number': {
			const parsed = toNumber(value);
			if (parsed === undefined) throw new Error('Value must be a finite number.');
			return parsed;
		}
		case 'integer': {
			const parsed = toNumber(value);
			if (parsed === undefined || !Number.isSafeInteger(parsed)) throw new Error('Value must be a whole number.');
			return parsed;
		}
		case 'boolean':
			if (typeof value === 'boolean') return value;
			if (value === 'true' || value === 'false') return value === 'true';
			throw new Error('Value must be true or false.');
		case 'dateTime':
			if (typeof value !== 'string') throw new Error('Value must be an ISO 8601 timestamp.');
			return normalizeTimestamp(value, 'Value');
		default:
			throw new Error('Choose a supported value type.');
	}
}

function required(context: IExecuteFunctions, name: string, label: string): string {
	const value = context.getNodeParameter(name, 0, '');
	if (typeof value !== 'string' || !value.trim()) {
		throw new NodeOperationError(context.getNode(), `${label} is required.`);
	}
	return value.trim();
}

/** Send: one Timeseries entry per input item, split into messages that respect the size limit. */
export const telemetrySend: AggregateExecutor = {
	applies: () => true,
	async run(context, items) {
		// Everything is validated before the credential is read or any request is made.
		let sourceId: string;
		try {
			sourceId = requireUuid(context.getNodeParameter('telemetrySourceId', 0, ''), 'Source ID');
		} catch (error) {
			throw new NodeOperationError(context.getNode(), (error as Error).message);
		}
		const pointGroupReferenceId = required(context, 'telemetryPointGroupReferenceId', 'Point Group Reference ID');
		const valueType = context.getNodeParameter('telemetryValueType', 0, 'auto') as string;

		const entries = items.map((_, index) => {
			const label = `Input item ${index + 1}`;
			const pointReferenceId = context.getNodeParameter('telemetryPointReferenceId', index, '');
			if (typeof pointReferenceId !== 'string' || !pointReferenceId.trim()) {
				throw new NodeOperationError(context.getNode(), `${label}: Point Reference ID is required.`);
			}
			const timestamp = context.getNodeParameter('telemetryTimestamp', index, '');
			let normalized: string;
			let value: Scalar;
			try {
				if (typeof timestamp !== 'string') throw new Error('Timestamp must be an ISO 8601 UTC timestamp.');
				normalized = normalizeTimestamp(timestamp, 'Timestamp');
				value = coerceValue(valueType, context.getNodeParameter('telemetryValue', index, undefined));
			} catch (error) {
				throw new NodeOperationError(context.getNode(), `${label}: ${(error as Error).message}`);
			}
			return {
				index,
				point: { PointReferenceId: pointReferenceId.trim(), Timestamp: normalized, Value: value },
			};
		});

		const envelope = (timeseries: IDataObject[]): IDataObject => ({
			ProtocolVersion: '1.0',
			SourceId: sourceId,
			PointGroupReferenceId: pointGroupReferenceId,
			NotificationType: 'TimeSeries',
			GeneratedAt: new Date().toISOString(),
			Timeseries: timeseries,
		});

		// Greedy chunking by serialized size. Never truncates: an entry that cannot fit alone is an error.
		const chunks: typeof entries[] = [];
		let current: typeof entries = [];
		for (const entry of entries) {
			const candidate = [...current, entry];
			if (byteLength(envelope(candidate.map(({ point }) => point))) <= MAX_MESSAGE_BYTES) {
				current = candidate;
				continue;
			}
			if (current.length === 0) {
				throw new NodeOperationError(
					context.getNode(),
					`Input item ${entry.index + 1}: the point does not fit in a ${MAX_MESSAGE_BYTES}-byte message; shorten its reference ID or text value.`,
				);
			}
			chunks.push(current);
			current = [entry];
			if (byteLength(envelope([entry.point])) > MAX_MESSAGE_BYTES) {
				throw new NodeOperationError(
					context.getNode(),
					`Input item ${entry.index + 1}: the point does not fit in a ${MAX_MESSAGE_BYTES}-byte message; shorten its reference ID or text value.`,
				);
			}
		}
		if (current.length > 0) chunks.push(current);
		if (chunks.length > MAX_MESSAGES_PER_RUN) {
			throw new NodeOperationError(
				context.getNode(),
				`This input needs ${chunks.length} messages; one run is limited to ${MAX_MESSAGES_PER_RUN}. Split the input; nothing was sent.`,
			);
		}

		const records: Array<{ json: IDataObject; pairedItem: number }> = [];
		let sent = 0;
		for (const [chunkIndex, chunk] of chunks.entries()) {
			try {
				await requestBdpIngress.call(context, envelope(chunk.map(({ point }) => point)));
			} catch (error) {
				throw new NodeOperationError(
					context.getNode(),
					chunkIndex === 0
						? (error as Error).message
						: `${(error as Error).message} Message ${chunkIndex + 1} of ${chunks.length} failed after the first ${sent} points were already sent.`,
				);
			}
			sent += chunk.length;
			for (const { index, point } of chunk) {
				records.push({
					pairedItem: index,
					json: {
						pointReferenceId: point.PointReferenceId,
						timestamp: point.Timestamp,
						value: point.Value,
						status: 'accepted',
						message: chunkIndex + 1,
					},
				});
			}
		}
		return records;
	},
};

export async function executeTelemetry(context: IExecuteFunctions): Promise<IDataObject[]> {
	// Send runs once over all items (telemetrySend); nothing is handled per item.
	return unsupported(context);
}
