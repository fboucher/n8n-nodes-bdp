import { createListSearch } from '../../shared/locator';

export const getBuildings = createListSearch({
	path: 'Buildings',
	label: 'Building',
	invalidResponseMessage: 'BDP returned an invalid building search response.',
});
