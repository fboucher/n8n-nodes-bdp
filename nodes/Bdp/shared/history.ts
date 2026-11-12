import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { historyFilters, pagination, requiredId } from './execution';
import { fetchScopedList } from './scopedList';
import { getBdpRequest } from './transport';

/**
 * Historical values for a parent resource (`GET /api/{path}/{id}/HistoricalValues`),
 * with the same validation order, window handling and pagination as Building history.
 */
export async function fetchHistoricalValues(
	context: IExecuteFunctions,
	itemIndex: number,
	parent: { path: string; parameter: string; label: string },
): Promise<IDataObject[]> {
	const page = pagination(context, itemIndex);
	const id = requiredId(context, itemIndex, parent.parameter, parent.label);
	return fetchScopedList(getBdpRequest(context), {
		scope: 'parent',
		scopePaths: { parent: parent.path },
		parentId: id,
		child: 'HistoricalValues',
		filters: historyFilters(context, itemIndex),
		...page,
	});
}
