import type { ILoadOptionsFunctions, INodeListSearchResult, INodeProperties } from 'n8n-workflow';
import { getBdpRequest } from './transport';

export function createResourceLocator(options: {
	displayName: string;
	name: string;
	searchMethod: string;
	listPlaceholder: string;
	idPlaceholder: string;
	displayOptions: INodeProperties['displayOptions'];
	required?: boolean;
}): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required ?? true,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From list',
				name: 'list',
				type: 'list',
				placeholder: options.listPlaceholder,
				typeOptions: { searchListMethod: options.searchMethod, searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: options.idPlaceholder,
			},
		],
	};
}

export function createListSearch(options: {
	path: string;
	label: string;
	invalidResponseMessage: string;
	parent?: { parameter: string; path: string; label: string; optional?: boolean };
}) {
	return async function (
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		let path = `/api/${options.path}`;
		if (options.parent) {
			const id = this.getNodeParameter(options.parent.parameter, '', { extractValue: true });
			const missing = typeof id !== 'string' || !id.trim();
			if (missing && !options.parent.optional) {
				throw new Error(
					`Select or enter a resolved ${options.parent.label} ID before searching ${options.label.toLowerCase()}s.`,
				);
			}
			if (!missing) {
				if (id.includes('{{') || id.includes('}}')) {
					throw new Error(
						`Select or enter a resolved ${options.parent.label} ID before searching ${options.label.toLowerCase()}s.`,
					);
				}
				path = `/api/${options.parent.path}/${encodeURIComponent(id)}/${options.path}`;
			}
		}
		const skip = paginationToken ? Number(paginationToken) : 0;
		if (!Number.isSafeInteger(skip) || skip < 0)
			throw new Error('Invalid BDP search pagination token.');
		const page = await getBdpRequest(this)(path, {
			take: 50,
			skip,
			...(filter ? { name: filter } : {}),
		});
		if (!Array.isArray(page.data)) throw new Error(options.invalidResponseMessage);
		const results = page.data.map((record: { id?: string; name?: string | null }) => ({
			name: record.name
				? `${record.name} (${record.id ?? ''})`
				: `${options.label} ${record.id ?? ''}`,
			value: record.id ?? '',
		}));
		return {
			results,
			paginationToken: results.length === 50 ? String(skip + results.length) : undefined,
		};
	};
}
