import { createListSearch } from '../../shared/locator';

export const getSources = createListSearch({
	path: 'Sources',
	label: 'Source',
	invalidResponseMessage: 'BDP returned an invalid source search response.',
});
