import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { createListSearch } from '../../shared/locator';

const searchAll = createListSearch({
	path: 'Buildings',
	label: 'Building',
	invalidResponseMessage: 'BDP returned an invalid building search response.',
});

const searchOrganization = createListSearch({
	path: 'Buildings',
	label: 'Building',
	invalidResponseMessage: 'BDP returned an invalid building search response.',
	parent: { parameter: 'organizationId', path: 'Organizations', label: 'organization' },
});

const searchSite = createListSearch({
	path: 'Buildings',
	label: 'Building',
	invalidResponseMessage: 'BDP returned an invalid building search response.',
	parent: { parameter: 'siteId', path: 'Sites', label: 'site' },
});

export async function getBuildings(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) {
	const scope = this.getNodeParameter('buildingSearchScope', 'all');
	if (scope === 'all') return searchAll.call(this, filter, paginationToken);
	if (scope === 'organization') return searchOrganization.call(this, filter, paginationToken);
	if (scope === 'site') return searchSite.call(this, filter, paginationToken);
	throw new Error('Choose a supported building search scope.');
}
