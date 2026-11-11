import { createListSearch } from '../../shared/locator';

export const getSites = createListSearch({
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
