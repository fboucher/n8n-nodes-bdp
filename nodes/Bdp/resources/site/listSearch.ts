import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { createListSearch } from '../../shared/locator';

const searchSites = createListSearch({
	path: 'Sites',
	label: 'Site',
	invalidResponseMessage: 'BDP returned an invalid site search response.',
	parent: {
		parameter: 'organizationId',
		path: 'Organizations',
		label: 'organization',
		optional: true,
	},
});

const searchAllSites = createListSearch({
	path: 'Sites',
	label: 'Site',
	invalidResponseMessage: 'BDP returned an invalid site search response.',
});

export async function getSites(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) {
	const resource = this.getNodeParameter('resource', '');
	return resource === 'building' || resource === 'measurementValue'
		? searchAllSites.call(this, filter, paginationToken)
		: searchSites.call(this, filter, paginationToken);
}
