const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { BdpIngressApi } = require('../dist/credentials/BdpIngressApi.credentials.js');
const { createContext, errorWithStatus } = require('./helpers.cjs');

const SAS_TOKEN = 'SharedAccessSignature sr=hub.example%2Fdevices%2FDev-1&sig=SECRETSIG%3D&se=4102444800&skn=policy';
const SOURCE_ID = 'FE8CBE22-C6B8-434A-93BF-923071EC6F68';

function setup(parameters, responses, count = parameters.length, credentials = {}) {
	const { context, calls } = createContext(parameters, responses, Array.from({ length: count }, () => ({ json: {} })));
	const credentialTypes = [];
	const original = context.helpers.httpRequestWithAuthentication;
	context.helpers.httpRequestWithAuthentication = function (type, options) {
		credentialTypes.push(type);
		return original.call(this, type, options);
	};
	context.getCredentials = async (type) => {
		if (type !== 'bdpIngressApi') throw new Error(`unexpected credential ${type}`);
		return { environment: 'uat', deviceId: 'Dev-1', sasToken: SAS_TOKEN, ...credentials };
	};
	return { context, calls, credentialTypes };
}

const point = (id, timestamp, value, extra = {}) => ({
	resource: 'telemetry',
	operation: 'send',
	telemetrySourceId: SOURCE_ID,
	telemetryPointGroupReferenceId: 'PG-1',
	telemetryValueType: 'auto',
	telemetryPointReferenceId: id,
	telemetryTimestamp: timestamp,
	telemetryValue: value,
	...extra,
});
const ok = { body: { ok: true }, statusCode: 200, headers: {} };

test('Send builds one Timeseries entry per input item and sets the envelope fields automatically', async () => {
	const before = Date.now();
	const { context, calls, credentialTypes } = setup(
		[point('P-1', '2025-08-08T05:45:12.406Z', 659440), point('P-2', '2025-08-08T07:45:12+02:00', 'text'), point('P-3', '2025-08-08T05:45:12Z', true)],
		[ok],
	);
	const [output] = await new Bdp().execute.call(context);
	const after = Date.now();
	assert.equal(calls.length, 1);
	assert.deepEqual(credentialTypes, ['bdpIngressApi']);
	const [call] = calls;
	assert.equal(call.method, 'POST');
	assert.equal(call.url, 'https://Graph-BdpDif-UAT.azure-devices.net/devices/Dev-1/messages/events');
	assert.deepEqual(call.qs, { 'api-version': '2020-09-30' });
	assert.equal(call.headers['Content-Type'], 'application/json');
	assert.equal(call.headers.Authorization, undefined, 'the token is applied by the credential, not set here');
	const { GeneratedAt, ...rest } = call.body;
	assert.ok(Date.parse(GeneratedAt) >= before && Date.parse(GeneratedAt) <= after);
	assert.match(GeneratedAt, /Z$/);
	assert.deepEqual(rest, {
		ProtocolVersion: '1.0',
		SourceId: SOURCE_ID,
		PointGroupReferenceId: 'PG-1',
		NotificationType: 'TimeSeries',
		Timeseries: [
			{ PointReferenceId: 'P-1', Timestamp: '2025-08-08T05:45:12.406Z', Value: 659440 },
			{ PointReferenceId: 'P-2', Timestamp: '2025-08-08T05:45:12.000Z', Value: 'text' },
			{ PointReferenceId: 'P-3', Timestamp: '2025-08-08T05:45:12.000Z', Value: true },
		],
	});
	assert.deepEqual(
		output.map(({ json, pairedItem }) => [json.pointReferenceId, json.status, json.message, pairedItem.item]),
		[['P-1', 'accepted', 1, 0], ['P-2', 'accepted', 1, 1], ['P-3', 'accepted', 1, 2]],
	);
});

test('Production credentials use the fixed production host', async () => {
	const { context, calls } = setup([point('P-1', '2025-08-08T05:45:12Z', 1)], [ok], 1, { environment: 'production' });
	await new Bdp().execute.call(context);
	assert.equal(calls[0].url, 'https://Graph-BdpDif.azure-devices.net/devices/Dev-1/messages/events');
	const { context: unknown } = setup([point('P-1', '2025-08-08T05:45:12Z', 1)], [ok], 1, { environment: 'https://evil.example' });
	const [output] = await new Bdp().execute.call({ ...unknown, continueOnFail: () => true });
	assert.match(output[0].json.error, /Choose UAT or Production/);
});

test('the device ID is URL-encoded and cannot change the host or path', async () => {
	const { context, calls } = setup([point('P-1', '2025-08-08T05:45:12Z', 1)], [ok], 1, { deviceId: 'a/b?x=1#frag' });
	await new Bdp().execute.call(context);
	assert.equal(calls[0].url, 'https://Graph-BdpDif-UAT.azure-devices.net/devices/a%2Fb%3Fx%3D1%23frag/messages/events');
});

test('value types coerce deterministically', async () => {
	const cases = [
		['number', '12.5', 12.5],
		['number', 7, 7],
		['integer', '42', 42],
		['boolean', 'true', true],
		['boolean', false, false],
		['string', 5, '5'],
		['dateTime', '2025-01-01T01:00:00+01:00', '2025-01-01T00:00:00.000Z'],
		['auto', 'plain', 'plain'],
	];
	for (const [valueType, input, expected] of cases) {
		const { context, calls } = setup([point('P', '2025-08-08T05:45:12Z', input, { telemetryValueType: valueType })], [ok]);
		await new Bdp().execute.call(context);
		assert.strictEqual(calls[0].body.Timeseries[0].Value, expected, `${valueType} ${input}`);
	}
});

test('Send validates everything before the credential is read or any request is made', async () => {
	const good = point('P-1', '2025-08-08T05:45:12Z', 1);
	for (const [parameters, message] of [
		[[{ ...good, telemetrySourceId: 'not-a-uuid' }], /Source ID must be a valid UUID/],
		[[{ ...good, telemetryPointGroupReferenceId: ' ' }], /Point Group Reference ID is required/],
		[[good, { ...good, telemetryPointReferenceId: '' }], /Input item 2: Point Reference ID is required/],
		[[{ ...good, telemetryTimestamp: '2025-08-08' }], /Input item 1: Timestamp must be an ISO 8601/],
		[[{ ...good, telemetryTimestamp: '2025-08-08T05:45:12' }], /explicit UTC offset/],
		[[{ ...good, telemetryTimestamp: '2025-13-01T00:00:00Z' }], /not a valid ISO 8601/],
		[[{ ...good, telemetryValue: { a: 1 } }], /Value must be a boolean, a finite number, or text/],
		[[{ ...good, telemetryValue: NaN }], /Value must be a boolean/],
		[[{ ...good, telemetryValue: 'abc', telemetryValueType: 'number' }], /finite number/],
		[[{ ...good, telemetryValue: '1.5', telemetryValueType: 'integer' }], /whole number/],
		[[{ ...good, telemetryValue: 'yes', telemetryValueType: 'boolean' }], /true or false/],
		[[{ ...good, telemetryValue: 'soon', telemetryValueType: 'dateTime' }], /explicit UTC offset/],
		[[{ ...good, telemetryValueType: 'weird' }], /supported value type/],
	]) {
		const { context, calls } = setup(parameters, [ok]);
		let credentialLookups = 0;
		const getCredentials = context.getCredentials;
		context.getCredentials = async (...args) => {
			credentialLookups++;
			return getCredentials(...args);
		};
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
		assert.equal(credentialLookups, 0);
	}
});

test('an expired, malformed or missing SAS token is reported clearly and never echoed', async () => {
	const expired = 'SharedAccessSignature sr=x&sig=SECRETSIG%3D&se=1000&skn=policy';
	for (const [credentials, message] of [
		[{ sasToken: expired }, /has expired/],
		[{ sasToken: 'Bearer SECRETSIG' }, /must start with "SharedAccessSignature "/],
		[{ sasToken: '' }, /must start with/],
		[{ deviceId: ' ' }, /Set the Device ID/],
	]) {
		const { context, calls } = setup([point('P', '2025-08-08T05:45:12Z', 1)], [ok], 1, credentials);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, message);
			assert.doesNotMatch(error.message, /SECRETSIG/);
			return true;
		});
		assert.equal(calls.length, 0);
	}
});

test('Send is never retried, even on transient failures', async () => {
	for (const error of [errorWithStatus(503, { 'retry-after': '0' }), errorWithStatus(429, { 'retry-after': '0' }), errorWithStatus(504), Object.assign(new Error('x'), { code: 'ETIMEDOUT' })]) {
		const { context, calls } = setup([point('P', '2025-08-08T05:45:12Z', 1)], [error, ok]);
		await assert.rejects(new Bdp().execute.call(context), /not retried automatically/);
		assert.equal(calls.length, 1);
	}
});

test('a 400 surfaces the platform error code, and no failure leaks the token, body or response', async () => {
	let { context } = setup([point('P', '2025-08-08T05:45:12Z', 1)], [errorWithStatus(400, { 'x-ms-error-code': 'InvalidOperation' })]);
	await assert.rejects(new Bdp().execute.call(context), /HTTP 400, error code InvalidOperation/);

	for (const code of ['bad code with spaces', 'x'.repeat(100), '<script>']) {
		({ context } = setup([point('P', '2025-08-08T05:45:12Z', 1)], [errorWithStatus(400, { 'x-ms-error-code': code })]));
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.doesNotMatch(error.message, /error code/);
			return true;
		});
	}
	for (const status of [400, 401, 403, 404, 413, 429, 500, 504, undefined]) {
		({ context } = setup([point('SECRET-POINT', '2025-08-08T05:45:12Z', 'SECRET-VALUE')], [status === undefined ? new Error(`${SAS_TOKEN} SECRET-VALUE`) : errorWithStatus(status)]));
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.doesNotMatch(error.message, /SECRETSIG|SECRET-VALUE|SECRET-POINT|private response body|SharedAccessSignature/);
			return true;
		});
	}
	({ context } = setup([point('P', '2025-08-08T05:45:12Z', 1)], [errorWithStatus(401)]));
	await assert.rejects(new Bdp().execute.call(context), /expired or invalid.*case-sensitive/);
});

test('the SAS token never appears in output items', async () => {
	const { context } = setup([point('P', '2025-08-08T05:45:12Z', 1)], [ok]);
	const [output] = await new Bdp().execute.call(context);
	assert.doesNotMatch(JSON.stringify(output), /SECRETSIG|SharedAccessSignature/);
});

test('large inputs are split into messages of at most 4 KB, never truncated', async () => {
	const count = 120;
	const parameters = Array.from({ length: count }, (_, n) => point(`Meter-${n}-Gas-Energy-Monthly-Sum`, '2025-08-08T05:45:12.406Z', n));
	const { context, calls } = setup(parameters, [ok, ok, ok, ok, ok, ok, ok, ok, ok, ok, ok, ok, ok, ok]);
	const [output] = await new Bdp().execute.call(context);
	assert.ok(calls.length > 1);
	let total = 0;
	for (const call of calls) {
		assert.ok(Buffer.byteLength(JSON.stringify(call.body)) <= 4096, 'message within 4096 bytes');
		total += call.body.Timeseries.length;
	}
	assert.equal(total, count);
	assert.equal(output.length, count);
	assert.deepEqual(output.map(({ pairedItem }) => pairedItem.item), parameters.map((_, n) => n));
	assert.deepEqual([...new Set(output.map(({ json }) => json.message))], calls.map((_, n) => n + 1));
});

test('a single point that cannot fit in a message is rejected before anything is sent', async () => {
	const { context, calls } = setup([point('P-ok', '2025-08-08T05:45:12Z', 1), point('P-big', '2025-08-08T05:45:12Z', 'x'.repeat(5000))], [ok]);
	await assert.rejects(new Bdp().execute.call(context), /Input item 2: the point does not fit in a 4096-byte message/);
	assert.equal(calls.length, 0);
});

test('a run that needs more than 200 messages is rejected explicitly with nothing sent', async () => {
	const parameters = Array.from({ length: 201 }, (_, n) => point(`P-${n}`, '2025-08-08T05:45:12Z', 'x'.repeat(3600)));
	const { context, calls } = setup(parameters, []);
	await assert.rejects(new Bdp().execute.call(context), /needs 201 messages; one run is limited to 200/);
	assert.equal(calls.length, 0);
});

test('a later message failure reports how many points were already sent', async () => {
	const parameters = Array.from({ length: 120 }, (_, n) => point(`Meter-${n}-Gas-Energy-Monthly-Sum`, '2025-08-08T05:45:12.406Z', n));
	const { context, calls } = setup(parameters, [ok, errorWithStatus(500)]);
	await assert.rejects(new Bdp().execute.call(context), /Message 2 of \d+ failed after the first \d+ points were already sent/);
	assert.equal(calls.length, 2);
});

test('Send with continue on fail returns one linked error item', async () => {
	const { context, calls } = setup([point('P', '2025-08-08T05:45:12Z', 1), point('', '2025-08-08T05:45:12Z', 1)], [ok]);
	context.continueOnFail = () => true;
	const [output] = await new Bdp().execute.call(context);
	assert.equal(output.length, 1);
	assert.match(output[0].json.error, /Input item 2/);
	assert.deepEqual(output[0].pairedItem, [{ item: 0 }, { item: 1 }]);
	assert.equal(calls.length, 0);
});

test('the v3 transport still rejects non-API paths and the Telemetry resource exposes only Send', () => {
	const description = new Bdp().description;
	const operation = description.properties.find((p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('telemetry'));
	assert.deepEqual(operation.options.map(({ value }) => value), ['send']);
	assert.ok(description.properties.find((p) => p.name === 'resource').options.some((o) => o.value === 'telemetry'));
	assert.deepEqual(
		description.credentials.map(({ name, displayOptions }) => [name, Object.keys(displayOptions)[0]]),
		[['bdpOAuth2Api', 'hide'], ['bdpIngressApi', 'show']],
	);
	assert.equal(description.credentials[0].name, 'bdpOAuth2Api');
});

test('the ingress credential stores secrets as password fields, authenticates via header and has a fixed host', () => {
	const credential = new BdpIngressApi();
	const byName = Object.fromEntries(credential.properties.map((p) => [p.name, p]));
	assert.deepEqual(Object.keys(byName).sort(), ['deviceId', 'environment', 'sasToken']);
	assert.equal(byName.sasToken.typeOptions.password, true);
	assert.equal(credential.authenticate.properties.headers.Authorization, '={{$credentials.sasToken}}');
	assert.deepEqual(byName.environment.options.map(({ value }) => value), ['uat', 'production']);
	assert.equal(credential.test, undefined, 'no test request: the endpoint only accepts telemetry');
	const source = JSON.stringify(credential.properties);
	assert.doesNotMatch(source, /azure-devices\.net/, 'no host is configurable on the credential');
});

test('the package ships the ingress credential but no tokens or private spec files', () => {
	const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
	assert.ok(packageJson.n8n.credentials.includes('dist/credentials/BdpIngressApi.credentials.js'));
	assert.ok(fs.existsSync(path.join(__dirname, '..', 'dist', 'credentials', 'BdpIngressApi.credentials.js')));
	for (const entry of packageJson.files) assert.doesNotMatch(entry, /\.local|spec|token/i);
	const shipped = [];
	(function scan(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) scan(full);
			else shipped.push(full);
		}
	})(path.join(__dirname, '..', 'dist'));
	for (const file of shipped.filter((f) => /\.(js|json)$/.test(f))) {
		assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /SharedAccessSignature sr=|SharedAccessKey=/, file);
	}
});

test('the credential test checks the device ID and token locally without sending anything', async () => {
	const { Bdp: Node } = { Bdp };
	const test = new Node().methods.credentialTest.bdpIngressApiTest;
	const call = (data) => test.call({}, { data });
	assert.equal((await call({ environment: 'uat', deviceId: 'Dev-1', sasToken: SAS_TOKEN })).status, 'OK');
	for (const [data, message] of [
		[{ environment: 'other', deviceId: 'Dev-1', sasToken: SAS_TOKEN }, /Choose UAT or Production/],
		[{ environment: 'uat', deviceId: '', sasToken: SAS_TOKEN }, /Device ID/],
		[{ environment: 'uat', deviceId: 'Dev-1', sasToken: 'SharedAccessSignature sr=x&sig=SECRETSIG&se=1000&skn=p' }, /expired/],
		[{ environment: 'uat', deviceId: 'Dev-1', sasToken: 'nope' }, /must start with/],
	]) {
		const result = await call(data);
		assert.equal(result.status, 'Error');
		assert.match(result.message, message);
		assert.doesNotMatch(result.message, /SECRETSIG/);
	}
	assert.equal(new Node().description.credentials[1].testedBy, 'bdpIngressApiTest');
});
