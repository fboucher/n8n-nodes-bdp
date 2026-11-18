import type { INodeProperties } from 'n8n-workflow';

const sendShow = { resource: ['telemetry'], operation: ['send'] };

export const telemetryOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['telemetry'] } },
	options: [{ name: 'Send', value: 'send', action: 'Send telemetry' }],
	default: 'send',
};

export const telemetryProperties: INodeProperties[] = [
	{
		displayName:
			'Send pushes time-series telemetry into BDP through the separate Telemetry Ingress API, using the BDP Telemetry Ingress credential. It is never retried automatically, so a timeout cannot duplicate data, but it also means a failed send may or may not have been delivered. BDP silently drops messages whose IDs it does not know.',
		name: 'telemetryNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: sendShow },
	},
	{
		displayName: 'Source ID',
		name: 'telemetrySourceId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'FE8CBE22-C6B8-434A-93BF-923071EC6F68',
		displayOptions: { show: sendShow },
		description: 'The UUID of the data source, as shown in the BDP Portal',
	},
	{
		displayName: 'Point Group Reference ID',
		name: 'telemetryPointGroupReferenceId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: sendShow },
		description: 'The reference ID of the point group the points belong to, as set in the BDP Portal',
	},
	{
		displayName: 'Point Reference ID',
		name: 'telemetryPointReferenceId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: sendShow },
		description:
			'The reference ID of the point for each input item; use an expression to read it from the item. One time-series entry is sent per input item.',
	},
	{
		displayName: 'Timestamp',
		name: 'telemetryTimestamp',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2025-01-01T00:00:00Z',
		displayOptions: { show: sendShow },
		description:
			'When the value was measured: ISO 8601 with seconds and an explicit UTC offset or Z. It is sent in UTC.',
	},
	{
		displayName: 'Value Type',
		name: 'telemetryValueType',
		type: 'options',
		options: [
			{ name: 'Automatic', value: 'auto', description: 'Send the value as it is: boolean, number, or text' },
			{ name: 'Boolean', value: 'boolean', description: 'True or false' },
			{ name: 'Date-Time', value: 'dateTime', description: 'An ISO 8601 timestamp, sent in UTC' },
			{ name: 'Number', value: 'number', description: 'A finite number; numeric text is converted' },
			{ name: 'Text', value: 'string', description: 'Always sent as text' },
			{ name: 'Whole Number', value: 'integer', description: 'An integer; numeric text is converted' },
		],
		default: 'auto',
		displayOptions: { show: sendShow },
		description: 'How to send the value of every input item',
	},
	{
		displayName: 'Value',
		name: 'telemetryValue',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: sendShow },
		description: 'The measured value for each input item; use an expression to read it from the item',
	},
];
