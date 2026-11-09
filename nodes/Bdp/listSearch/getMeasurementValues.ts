import type {
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { getBdpRequest } from '../shared/transport';

export async function getMeasurementValues(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const buildingId = this.getNodeParameter('buildingId', '', { extractValue: true });
	if (
		typeof buildingId !== 'string' ||
		!buildingId.trim() ||
		buildingId.includes('{{') ||
		buildingId.includes('}}')
	) {
		throw new Error('Select or enter a resolved building ID before searching measurement points.');
	}
	const skip = paginationToken ? Number(paginationToken) : 0;
	const page = await getBdpRequest(this)(
		`/api/Buildings/${encodeURIComponent(buildingId)}/MeasurementValues`,
		{
			take: 50,
			skip,
			...(filter ? { name: filter } : {}),
		},
	);
	if (!Array.isArray(page.data)) {
		throw new Error('BDP returned an invalid measurement-point search response.');
	}

	const results: INodeListSearchItems[] = page.data.map((record) => {
		const point = record as { id?: string; name?: string | null };
		return {
			name: point.name
				? `${point.name} (${point.id ?? ''})`
				: `Measurement point ${point.id ?? ''}`,
			value: point.id ?? '',
		};
	});
	return {
		results,
		paginationToken: results.length === 50 ? String(skip + results.length) : undefined,
	};
}
