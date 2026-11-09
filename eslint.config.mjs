import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		files: ['package.json'],
		// Phase two deliberately ships a declared parser dependency for self-hosted n8n.
		rules: { '@n8n/community-nodes/no-runtime-dependencies': 'off' },
	},
	{
		files: ['nodes/Bdp/shared/graphql.ts'],
		// Pure validation helpers are wrapped in item-linked NodeOperationError by the node.
		rules: { '@n8n/community-nodes/require-node-api-error': 'off' },
	},
];
