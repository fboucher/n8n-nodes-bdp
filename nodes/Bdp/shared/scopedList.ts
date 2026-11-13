import type { IDataObject } from 'n8n-workflow';
import { fetchAllPages, type BdpRequest } from './transport';

export async function fetchScopedList(
	request: BdpRequest,
	options: {
		scope: string;
		scopePaths: Record<string, string>;
		parentId: string;
		child: string;
		filters?: IDataObject;
		orderBy?: string;
		returnAll: boolean;
		limit: number;
		pageSize?: number;
	},
): Promise<IDataObject[]> {
	const parent = Object.prototype.hasOwnProperty.call(options.scopePaths, options.scope)
		? options.scopePaths[options.scope]
		: undefined;
	if (!parent) throw new Error(`Unsupported BDP scope: ${options.scope}`);
	if (!options.parentId.trim()) throw new Error('A parent ID is required for a scoped list.');
	return fetchAllPages(
		request,
		`/api/${parent}/${encodeURIComponent(options.parentId)}/${options.child}`,
		{ ...options.filters, ...(options.orderBy ? { orderBy: options.orderBy } : {}) },
		{ returnAll: options.returnAll, limit: options.limit, pageSize: options.pageSize },
	);
}
