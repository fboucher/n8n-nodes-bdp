import { createListSearch } from '../../shared/locator';

export const getDataSets = createListSearch({
	path: 'DataSets',
	label: 'Dataset',
	invalidResponseMessage: 'BDP returned an invalid dataset search response.',
});
