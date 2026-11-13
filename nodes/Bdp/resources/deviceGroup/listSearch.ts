import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { createListSearch } from '../../shared/locator';

const searchFor = (parameter: string, path: string, label: string) =>
	createListSearch({
		path: 'DeviceGroups',
		label: 'Device Group',
		invalidResponseMessage: 'BDP returned an invalid device group search response.',
		parent: { parameter, path, label },
	});

const searchers: Record<string, ReturnType<typeof searchFor>> = {
	building: searchFor('buildingId', 'Buildings', 'building'),
	source: searchFor('sourceId', 'Sources', 'source'),
};

export async function getDeviceGroups(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) {
	const scope = this.getNodeParameter('deviceGroupScope', 'building') as string;
	const search = Object.prototype.hasOwnProperty.call(searchers, scope)
		? searchers[scope]
		: undefined;
	if (!search) throw new Error('Choose a supported device group scope.');
	return search.call(this, filter, paginationToken);
}
