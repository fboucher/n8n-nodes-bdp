import type { INodeProperties } from 'n8n-workflow';

export const graphqlOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['graphql'] } },
	options: [{ name: 'Execute Query', value: 'executeQuery', action: 'Execute a read only query' }],
	default: 'executeQuery',
};

export const graphqlProperties: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 10 },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['graphql'], operation: ['executeQuery'] } },
		description:
			'Read-only GraphQL document. Every operation must be a query; pagination is controlled by your document.',
	},
	{
		displayName: 'Variables',
		name: 'variables',
		type: 'json',
		default: '{}',
		displayOptions: { show: { resource: ['graphql'], operation: ['executeQuery'] } },
		description:
			'JSON object of variables, or an expression returning an object. Native JSON value types are preserved.',
	},
	{
		displayName: 'Operation Name',
		name: 'operationName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['graphql'], operation: ['executeQuery'] } },
		description: 'Named query to execute. Required when the document contains multiple queries.',
	},
];
