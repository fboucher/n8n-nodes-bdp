import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { createListSearch } from '../../shared/locator';

const searchFor = (parameter: string, path: string, label: string) =>
	createListSearch({
		path: 'MeasurementValues',
		label: 'Measurement point',
		invalidResponseMessage: 'BDP returned an invalid measurement-point search response.',
		parent: { parameter, path, label },
	});

const searchers: Record<string, ReturnType<typeof searchFor>> = {
	building: searchFor('buildingId', 'Buildings', 'building'),
	floor: searchFor('floorId', 'Floors', 'floor'),
	space: searchFor('spaceId', 'Spaces', 'space'),
	device: searchFor('deviceId', 'Devices', 'device'),
	deviceGroup: searchFor('deviceGroupId', 'DeviceGroups', 'device group'),
	dataSet: searchFor('dataSetId', 'DataSets', 'data set'),
};

export async function getMeasurementValues(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) {
	// Workflows saved before scopes existed have no scope and keep using the building.
	const scope = this.getNodeParameter('measurementScope', 'building') as string;
	const search = Object.prototype.hasOwnProperty.call(searchers, scope)
		? searchers[scope]
		: undefined;
	if (!search) throw new Error('Choose a supported measurement-point scope.');
	return search.call(this, filter, paginationToken);
}
