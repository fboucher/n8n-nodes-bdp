import type { ILoadOptionsFunctions, INodeListSearchResult, INodeListSearchItems } from 'n8n-workflow';
import { getBdpRequest } from '../shared/transport';

export async function getBuildings(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const skip = paginationToken ? Number(paginationToken) : 0;
	let path = '/api/Buildings';
	let scope: { organizationId?: string; siteId?: string } = {};
	try {
		scope = (this.getCurrentNodeParameter('locatorScope') as typeof scope) ?? {};
	} catch {
		// Not available outside the editor; fall back to all buildings.
	}
	if (scope.siteId?.trim()) path = `/api/Sites/${encodeURIComponent(scope.siteId.trim())}/Buildings`;
	else if (scope.organizationId?.trim())
		path = `/api/Organizations/${encodeURIComponent(scope.organizationId.trim())}/Buildings`;
	const page = await getBdpRequest(this)(path, {
		take: 50,
		skip,
		...(filter ? { name: filter } : {}),
	});
	if (!Array.isArray(page.data)) {
		throw new Error('BDP returned an invalid building search response.');
	}

	const results: INodeListSearchItems[] = page.data.map((record) => {
		const building = record as { id?: string; name?: string | null };
		return {
			name: building.name ? `${building.name} (${building.id ?? ''})` : `Building ${building.id ?? ''}`,
			value: building.id ?? '',
		};
	});
	return {
		results,
		paginationToken: results.length === 50 ? String(skip + results.length) : undefined,
	};
}
