import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { unsupported } from '../../shared/execution';
import { requestBdpGraphql } from '../../shared/transport';

export async function executeGraphql(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	if (operation !== 'executeQuery') return unsupported(context);
	return [
		await requestBdpGraphql.call(
			context,
			context.getNodeParameter('query', itemIndex),
			context.getNodeParameter('variables', itemIndex, '{}'),
			context.getNodeParameter('operationName', itemIndex, ''),
		),
	];
}
