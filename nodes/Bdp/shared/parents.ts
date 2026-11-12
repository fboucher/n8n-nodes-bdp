import type { INodeProperties } from 'n8n-workflow';
import { createResourceLocator } from './locator';
import { buildingResource } from '../resources/building/properties';
import { spaceResource } from '../resources/space/properties';
import { sourceResource } from '../resources/source/properties';
import { deviceResource } from '../resources/device/properties';
import { deviceGroupResource } from '../resources/deviceGroup/properties';
import { dataSetResource } from '../resources/dataSet/properties';

/**
 * Builders for "pick a parent" selectors that another resource can show under its own
 * display conditions. Each chain ends in the locator for the target parent, preceded by
 * the optional selectors that only exist to narrow that locator's search. The locators
 * themselves are the shared ones, so a chain behaves exactly like the owning resource.
 */
export type Show = Record<string, string[]>;

const withShow = (property: INodeProperties, show: Show, required?: boolean): INodeProperties => ({
	...property,
	...(required === undefined ? {} : { required }),
	displayOptions: { show },
});

export const buildingSelector = (
	show: Show,
	required: boolean,
	displayName = 'Building',
	description?: string,
): INodeProperties => ({
	...withShow(buildingResource, show, required),
	displayName,
	...(description ? { description } : {}),
});

export function floorChain(show: Show, required: boolean): INodeProperties[] {
	return [
		buildingSelector(
			show,
			false,
			'Building (to Search Floors)',
			'Select a building to search its floors; not needed when entering a Floor ID',
		),
		{
			...createResourceLocator({
				displayName: 'Floor',
				name: 'floorId',
				searchMethod: 'getFloors',
				listPlaceholder: 'Select a floor...',
				idPlaceholder: 'Enter a floor ID',
				required,
				displayOptions: { show },
			}),
			typeOptions: { loadOptionsDependsOn: ['buildingId.value'] },
		},
	];
}

export function spaceChain(show: Show, required: boolean): INodeProperties[] {
	const floorShow = { ...show, spaceScope: ['floor'] };
	return [
		{
			displayName: 'Space Search Scope',
			name: 'spaceScope',
			type: 'options',
			options: [
				{ name: 'In Building', value: 'building' },
				{ name: 'On Floor', value: 'floor' },
			],
			default: 'building',
			displayOptions: { show },
			description: 'Choose the building or floor the Space selector searches',
		},
		buildingSelector(
			{ ...show, spaceScope: ['building'] },
			false,
			'Building (to Search Spaces)',
			'Select a building to search its spaces; not needed when entering a Space ID',
		),
		...floorChain(floorShow, false),
		withShow(spaceResource, show, required),
	];
}

export const sourceSelector = (show: Show, required: boolean): INodeProperties =>
	withShow(sourceResource, show, required);

export function deviceChain(show: Show, required: boolean): INodeProperties[] {
	return [
		{
			displayName: 'Device Search Scope',
			name: 'deviceScope',
			type: 'options',
			options: [
				{ name: 'In Building', value: 'building' },
				{ name: 'On Floor', value: 'floor' },
				{ name: 'In Space', value: 'space' },
				{ name: 'From Source', value: 'source' },
			],
			default: 'building',
			displayOptions: { show },
			description: 'Choose the parent the Device selector searches',
		},
		buildingSelector(
			{ ...show, deviceScope: ['building'] },
			false,
			'Building (to Search Devices)',
			'Select a building to search its devices; not needed when entering a Device ID',
		),
		...floorChain({ ...show, deviceScope: ['floor'] }, false),
		...spaceChain({ ...show, deviceScope: ['space'] }, false),
		sourceSelector({ ...show, deviceScope: ['source'] }, false),
		withShow(deviceResource, show, required),
	];
}

export function deviceGroupChain(show: Show, required: boolean): INodeProperties[] {
	return [
		{
			displayName: 'Device Group Search Scope',
			name: 'deviceGroupScope',
			type: 'options',
			options: [
				{ name: 'In Building', value: 'building' },
				{ name: 'From Source', value: 'source' },
			],
			default: 'building',
			displayOptions: { show },
			description: 'Choose the building or source the Device Group selector searches',
		},
		buildingSelector(
			{ ...show, deviceGroupScope: ['building'] },
			false,
			'Building (to Search Device Groups)',
			'Select a building to search its device groups; not needed when entering a Device Group ID',
		),
		sourceSelector({ ...show, deviceGroupScope: ['source'] }, false),
		withShow(deviceGroupResource, show, required),
	];
}

export const dataSetSelector = (show: Show, required: boolean): INodeProperties =>
	withShow(dataSetResource, show, required);
