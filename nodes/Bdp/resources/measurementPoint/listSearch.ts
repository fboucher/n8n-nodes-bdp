import { createListSearch } from '../../shared/locator';

export const getMeasurementValues = createListSearch({
	path: 'MeasurementValues',
	label: 'Measurement point',
	invalidResponseMessage: 'BDP returned an invalid measurement-point search response.',
	parent: { parameter: 'buildingId', path: 'Buildings', label: 'building' },
});
