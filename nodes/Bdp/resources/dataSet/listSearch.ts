import { createListSearch } from '../../shared/locator';

export const getDataSets = createListSearch({
	path: 'DataSets',
	label: 'Data Set',
	invalidResponseMessage: 'BDP returned an invalid data set search response.',
});
