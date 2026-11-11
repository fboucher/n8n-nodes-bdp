import type { ILoadOptionsFunctions, INodeListSearchResult, INodeListSearchItems } from 'n8n-workflow';
import { getBdpRequest } from '../shared/transport';

export async function getSites(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const skip = paginationToken ? Number(paginationToken) : 0;
	const page = await getBdpRequest(this)('/api/Sites', {
		take: 50,
		skip,
		...(filter ? { name: filter } : {}),
	});
	if (!Array.isArray(page.data)) {
		throw new Error('BDP returned an invalid site search response.');
	}

	const results: INodeListSearchItems[] = page.data.map((raw) => {
		const record = raw as { id?: string; name?: string | null };
		return {
			name: record.name ? `${record.name} (${record.id ?? ''})` : `Site ${record.id ?? ''}`,
			value: record.id ?? '',
		};
	});
	return {
		results,
		paginationToken: results.length === 50 ? String(skip + results.length) : undefined,
	};
}
