import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { createListSearch } from '../../shared/locator';

const searchFor = (parameter: string, path: string, label: string) =>
	createListSearch({
		path: 'Devices',
		label: 'Device',
		invalidResponseMessage: 'BDP returned an invalid device search response.',
		parent: { parameter, path, label },
	});

const searchers: Record<string, ReturnType<typeof searchFor>> = {
	building: searchFor('buildingId', 'Buildings', 'building'),
	floor: searchFor('floorId', 'Floors', 'floor'),
	space: searchFor('spaceId', 'Spaces', 'space'),
	source: searchFor('sourceId', 'Sources', 'source'),
};

export async function getDevices(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) {
	const scope = this.getNodeParameter('deviceScope', 'building') as string;
	const search = Object.prototype.hasOwnProperty.call(searchers, scope)
		? searchers[scope]
		: undefined;
	if (!search) throw new Error('Choose a supported device scope.');
	return search.call(this, filter, paginationToken);
}
