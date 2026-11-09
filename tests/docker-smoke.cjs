const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const image = 'n8nio/n8n:2.44.4';
const container = `bdp-phase-two-${randomUUID()}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bdp-package-smoke-'));
const installed = '/home/node/.n8n/nodes/node_modules/n8n-nodes-bdp';

function command(executable, args, { quiet = false } = {}) {
	const result = spawnSync(executable, args, {
		cwd: root,
		encoding: 'utf8',
		timeout: 600_000,
		// npm is a .cmd shim on Windows.
		shell: process.platform === 'win32' && executable === 'npm',
	});
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`${executable} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
	if (!quiet && result.stdout) process.stdout.write(result.stdout);
	return result.stdout.trim();
}

async function main() {
	let created = false;
	try {
		const packed = JSON.parse(
			command('npm', ['pack', '--json', '--pack-destination', temporary], { quiet: true }),
		)[0];
		const paths = packed.files.map(({ path: filename }) => filename);
		assert.ok(paths.includes('dist/nodes/Bdp/shared/graphql.js'));
		assert.ok(paths.includes('dist/icons/bdp.svg'));
		assert.ok(paths.includes('README.md'));
		assert.ok(
			paths.every(
				(filename) =>
					!/(^|\/)(\.local|node_modules|tests|temp)(\/|$)|\.tsbuildinfo$/.test(filename),
			),
		);
		const archive = path.join(temporary, packed.filename);
		command(
			'docker',
			[
				'create',
				'--name',
				container,
				'--publish',
				'127.0.0.1::5678',
				'--env',
				'N8N_DIAGNOSTICS_ENABLED=false',
				'--env',
				'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
				'--env',
				'N8N_TEMPLATES_ENABLED=false',
				'--env',
				'N8N_UNVERIFIED_PACKAGES_ENABLED=true',
				'--env',
				'N8N_SECURE_COOKIE=false',
				'--entrypoint',
				'sh',
				image,
				'-c',
				`mkdir -p /home/node/.n8n/nodes && cd /home/node/.n8n/nodes && ` +
					`npm install --omit=dev --ignore-scripts --no-audit --no-fund /tmp/bdp.tgz && ` +
					`cp -r /tmp/bdp-tests ${installed}/tests && ` +
					`node --test ${installed}/tests/*.test.cjs && ` +
					`node ${installed}/tests/docker-oauth.cjs && ` +
					`n8n import:workflow --input=${installed}/examples/graphql-nested-query.json && ` +
					`n8n import:workflow --input=${installed}/examples/graphql-two-pages.json && ` +
					`n8n start`,
			],
			{ quiet: true },
		);
		created = true;
		command('docker', ['cp', archive, `${container}:/tmp/bdp.tgz`]);
		command('docker', ['cp', __dirname, `${container}:/tmp/bdp-tests`]);
		command('docker', ['start', container], { quiet: true });
		const binding = command('docker', ['port', container, '5678/tcp'], { quiet: true });
		const base = `http://${binding}`;
		let ready = false;
		for (let attempt = 0; attempt < 180; attempt++) {
			try {
				const response = await fetch(`${base}/rest/settings`, {
					signal: AbortSignal.timeout(2000),
				});
				ready = response.ok;
			} catch (error) {
				if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
			}
			if (ready) break;
			const running = command('docker', ['inspect', '--format', '{{.State.Running}}', container], {
				quiet: true,
			});
			assert.equal(running, 'true', 'Docker smoke container exited before n8n was ready.');
			await delay(2000);
		}
		assert.ok(ready, 'n8n did not become ready within the bounded startup window.');
		const setup = await fetch(`${base}/rest/owner/setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: 'smoke@example.invalid',
				firstName: 'Smoke',
				lastName: 'Test',
				password: `SmokeOnly!A9${randomUUID()}`,
			}),
		});
		assert.ok(setup.ok, `Disposable owner setup failed: HTTP ${setup.status}`);
		const cookie = setup.headers
			.getSetCookie()
			.map((entry) => entry.split(';')[0])
			.join('; ');
		const nodeResponse = await fetch(`${base}/types/nodes.json`, { headers: { Cookie: cookie } });
		assert.ok(nodeResponse.ok, `Node discovery failed: HTTP ${nodeResponse.status}`);
		const nodes = await nodeResponse.json();
		const bdp = nodes.find(({ name }) => name === 'n8n-nodes-bdp.bdp');
		assert.ok(bdp, 'Installed node was not discovered by n8n.');
		const resource = bdp.properties.find(({ name }) => name === 'resource');
		// n8n appends its own HTTP Request shortcut; it is not an implemented BDP operation.
		assert.deepEqual(
			resource.options.map(({ value }) => value).filter((value) => value !== '__CUSTOM_API_CALL__'),
			['building', 'graphql', 'measurementValue'],
		);
		const operations = bdp.properties.filter(({ name }) => name === 'operation');
		assert.deepEqual(
			operations
				.flatMap(({ options }) => options.map(({ value }) => value))
				.filter((value) => value !== '__CUSTOM_API_CALL__')
				.sort(),
			['getAll', 'getById', 'getHistorical', 'getAll', 'getHistorical', 'executeQuery'].sort(),
		);
		assert.equal(bdp.credentials[0].name, 'bdpOAuth2Api');
		const credentialsResponse = await fetch(`${base}/types/credentials.json`, {
			headers: { Cookie: cookie },
		});
		assert.ok(credentialsResponse.ok);
		const credentials = await credentialsResponse.json();
		assert.ok(credentials.some(({ name }) => name === 'bdpOAuth2Api'));
		command('docker', ['exec', container, 'test', '-f', `${installed}/dist/icons/bdp.svg`]);
		const versions = command(
			'docker',
			[
				'exec',
				container,
				'node',
				'-e',
				`const p=require('${installed}/package.json');` +
					`const g=require(require.resolve('graphql/package.json',{paths:['${installed}']}));` +
					`console.log(JSON.stringify({node:process.version,package:p.version,graphql:g.version}));`,
			],
			{ quiet: true },
		);
		console.log(`Docker smoke passed: ${image}; ${versions}; archive sha512 ${packed.integrity}`);
		console.log(
			'Archive-only installation, full mocked suite, example imports, node/credential discovery, REST/GraphQL operations and icon verified. No live BDP requests made.',
		);
	} catch (error) {
		if (created) {
			const logs = spawnSync('docker', ['logs', '--tail', '120', container], { encoding: 'utf8' });
			process.stderr.write(`${logs.stdout ?? ''}${logs.stderr ?? ''}`);
		}
		throw error;
	} finally {
		if (created) command('docker', ['rm', '--force', container], { quiet: true });
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
