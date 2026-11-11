import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { historyFilters, pagination, requiredId, unsupported } from '../../shared/execution';
import { fetchScopedList } from '../../shared/scopedList';
import { getBdpRequest } from '../../shared/transport';

export async function executeMeasurementPoint(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const page = pagination(context, itemIndex);
	const request = getBdpRequest(context);
	if (operation === 'getAll') {
		const id = requiredId(context, itemIndex, 'buildingId', 'Building');
		const filters: IDataObject = {};
		for (const name of ['name', 'ontologyType', 'unit']) {
			const value = context.getNodeParameter(name, itemIndex, '') as string;
			if (value) filters[name] = value;
		}
		return fetchScopedList(request, {
			scope: 'building',
			scopePaths: { building: 'Buildings' },
			parentId: id,
			child: 'MeasurementValues',
			filters,
			...page,
		});
	}
	if (operation === 'getHistorical') {
		const id = requiredId(context, itemIndex, 'measurementId', 'Measurement point');
		return fetchScopedList(request, {
			scope: 'measurementPoint',
			scopePaths: { measurementPoint: 'MeasurementValue' },
			parentId: id,
			child: 'HistoricalValues',
			filters: historyFilters(context, itemIndex),
			...page,
		});
	}
	return unsupported(context);
}
