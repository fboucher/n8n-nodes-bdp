import { createListSearch } from '../../shared/locator';

export const getEventHubs = createListSearch({
	path: 'EventHubs',
	label: 'Event Hub',
	invalidResponseMessage: 'BDP returned an invalid event hub search response.',
});
