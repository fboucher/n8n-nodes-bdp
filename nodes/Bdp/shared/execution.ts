import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { normalizeWindow } from './time';

export function pagination(context: IExecuteFunctions, itemIndex: number, buildingList = false) {
	const returnAll = buildingList
		? (context.getNodeParameter('returnAllBuildings', itemIndex, true) as boolean)
		: (context.getNodeParameter('returnAll', itemIndex, false) as boolean);
	const limit = buildingList
		? (context.getNodeParameter('buildingLimit', itemIndex, 100) as number)
		: (context.getNodeParameter('limit', itemIndex, 100) as number);
	if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1)) {
		throw new NodeOperationError(context.getNode(), 'Limit must be a positive whole number.');
	}
	return { returnAll, limit };
}

export function requiredId(
	context: IExecuteFunctions,
	itemIndex: number,
	parameter: string,
	label: string,
) {
	const id = context.getNodeParameter(parameter, itemIndex, '', { extractValue: true }) as string;
	if (!id.trim()) throw new NodeOperationError(context.getNode(), `${label} ID is required.`);
	return id;
}

export function historyFilters(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const start = context.getNodeParameter('start', itemIndex) as string;
	const end = context.getNodeParameter('end', itemIndex) as string;
	return { ...normalizeWindow(start, end), orderBy: 'TimestampAscending' };
}

export function unsupported(context: IExecuteFunctions): never {
	throw new NodeOperationError(context.getNode(), 'This BDP operation is not supported.');
}

/**
 * Operations that act on every input item at once (for example one batched request per
 * device group) instead of once per item. `applies` decides per run, for operations that
 * also have a per-item mode. Each record names the input item it belongs to.
 */
export interface AggregateExecutor {
	applies: (context: IExecuteFunctions) => boolean;
	run: (
		context: IExecuteFunctions,
		items: INodeExecutionData[],
	) => Promise<Array<{ json: IDataObject; pairedItem: number }>>;
}
