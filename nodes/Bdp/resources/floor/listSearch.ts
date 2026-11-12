import { createListSearch } from '../../shared/locator';

export const getFloors = createListSearch({
	path: 'Floors',
	label: 'Floor',
	invalidResponseMessage: 'BDP returned an invalid floor search response.',
	parent: { parameter: 'buildingId', path: 'Buildings', label: 'building' },
});
