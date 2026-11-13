import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { createListSearch } from '../../shared/locator';

const searchBuilding = createListSearch({
	path: 'Spaces',
	label: 'Space',
	invalidResponseMessage: 'BDP returned an invalid space search response.',
	parent: { parameter: 'buildingId', path: 'Buildings', label: 'building' },
});

const searchFloor = createListSearch({
	path: 'Spaces',
	label: 'Space',
	invalidResponseMessage: 'BDP returned an invalid space search response.',
	parent: { parameter: 'floorId', path: 'Floors', label: 'floor' },
});

export async function getSpaces(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) {
	const scope = this.getNodeParameter('spaceScope', 'building');
	if (scope === 'building') return searchBuilding.call(this, filter, paginationToken);
	if (scope === 'floor') return searchFloor.call(this, filter, paginationToken);
	throw new Error('Choose a supported space scope.');
}
