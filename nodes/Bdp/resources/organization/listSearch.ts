import { createListSearch } from '../../shared/locator';

export const getOrganizations = createListSearch({
	path: 'Organizations',
	label: 'Organization',
	invalidResponseMessage: 'BDP returned an invalid organization search response.',
});
