import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

type RunOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

type ManifestResult = {
	namespace: string;
	auth: { kind: string };
	commands: Array<{ id: string }>;
};

type ValidateResult = {
	ok: boolean;
	path: string;
	summary: {
		entities: number;
		roles: string[];
	};
};

type ContextResult = {
	entity: { key: string };
	project: { key: string };
	surface: {
		plugin?: string;
		kind: string;
	};
};

type SurfaceRow = {
	role: string;
	optional: string;
};

type ProjectsSyncPlanResult = {
	apply: boolean;
	workspace: string;
	policySurface: string;
	projectCount: number;
	linkCount: number;
	projects: Array<{ payload: { attributes: Record<string, unknown> } }>;
	links: Array<{ role: string; url: string }>;
};

type ProjectsSyncApplyResult = {
	plan: { projects: Array<{ existingId: string | null }> };
	result: { projects: Array<{ action: string }> };
};

type FakeMereCall = {
	args: string[];
	data: null | {
		attributes?: Record<string, unknown>;
	};
};

const root = path.resolve(import.meta.dirname, '..');
const bin = path.join(root, 'dist', 'run.js');

function commandResult(args: string[], options: RunOptions = {}): SpawnSyncReturns<string> {
	return spawnSync(process.execPath, [bin, ...args], {
		cwd: options.cwd ?? root,
		env: options.env ?? process.env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

function run(args: string[], options: RunOptions = {}): string {
	const result = commandResult(args, options);
	if (result.status !== 0) {
		throw new Error(`mere-link ${args.join(' ')} failed\n${result.stderr}${result.stdout}`);
	}
	return result.stdout;
}

function parseJson<T>(value: string): T {
	return JSON.parse(value) as T;
}

async function tempDir(): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), 'mere-link-'));
}

test('prints a MereKit adapter manifest', () => {
	const manifest = parseJson<ManifestResult>(run(['commands', '--json']));
	assert.equal(manifest.namespace, 'link');
	assert.equal(manifest.auth.kind, 'none');
	assert.equal(manifest.commands.length, 12);
	assert.ok(manifest.commands.some((command) => command.id === 'generate.workspace'));
	assert.ok(manifest.commands.some((command) => command.id === 'sync.projects'));
});

test('initializes, validates, and resolves a starter config', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	run(['config', 'init', '--workspace', 'ws_123', '--name', 'Acme', '--output', configPath, '--yes']);

	const yaml = await readFile(configPath, 'utf8');
	assert.match(yaml, /plugin: mere/);
	assert.doesNotMatch(yaml, /work:\n\s+integration: mere\n\s+plugin:/);

	const validate = parseJson<ValidateResult>(run(['config', 'validate', '--config', configPath, '--json']));
	assert.equal(validate.ok, true);
	assert.equal(validate.summary.entities, 1);
	assert.deepEqual(validate.summary.roles, ['code', 'docs', 'work']);

	const context = parseJson<ContextResult>(run(['context', 'inspect', 'acme', 'workspace', '--role', 'work', '--config', configPath, '--json']));
	assert.equal(context.entity.key, 'acme');
	assert.equal(context.project.key, 'workspace');
	assert.equal(context.surface.plugin, 'mere');
	assert.equal(context.surface.kind, 'workspace');
});

test('generates workspace config from a snapshot file', async () => {
	const dir = await tempDir();
	const snapshotPath = path.join(dir, 'snapshot.json');
	const configPath = path.join(dir, 'generated.yaml');
	await mkdir(dir, { recursive: true });
	await writeFile(snapshotPath, JSON.stringify({
		workspace: 'ws_456',
		apps: [
			{ app: 'projects', namespace: 'projects', ok: true },
			{ app: 'finance', namespace: 'finance', ok: false },
			{ app: 'link', namespace: 'link', ok: true }
		]
	}), 'utf8');

	run(['generate', 'workspace', '--snapshot-file', snapshotPath, '--output', configPath, '--yes']);
	const rows = parseJson<SurfaceRow[]>(run(['surfaces', 'list', '--config', configPath, '--json']));
	assert.deepEqual(rows.map((row) => row.role).sort(), ['finance', 'projects', 'work']);
	assert.equal(rows.find((row) => row.role === 'finance')?.optional, 'yes');
	assert.equal(rows.find((row) => row.role === 'projects')?.optional, 'no');
});

test('validates Monday board surfaces', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  monday:
    plugin: monday
    tokenEnv: MONDAY_API_KEY
  slack:
    plugin: slack
entities:
  geoacuity:
    name: GeoAcuity
    projects:
      egis:
        name: eGIS
        surfaces:
          work:
            integration: monday
            kind: board
            id: "18204749659"
          discussion:
            integration: slack
            kind: channel
            id: C0B2EAX4RQC
            policy:
              writes: [topic, purpose, canvas, bookmark, message, pin]
`, 'utf8');

	const context = parseJson<ContextResult>(run(['context', 'inspect', 'geoacuity', 'egis', '--role', 'work', '--config', configPath, '--json']));
	assert.equal(context.surface.plugin, 'monday');
	assert.equal(context.surface.kind, 'board');
});

test('resolves relative config paths from the original shell PWD', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	run(['config', 'init', '--workspace', 'ws_123', '--name', 'Acme', '--output', configPath, '--yes']);

	const validate = parseJson<ValidateResult>(run(['config', 'validate', '--config', 'mere.link.yaml', '--json'], {
		cwd: path.dirname(bin),
		env: { ...process.env, PWD: dir }
	}));
	assert.equal(validate.ok, true);
	assert.equal(validate.path, configPath);
});

test('plans Mere Projects materialization with explicit sync policy', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_geo
  monday:
    plugin: monday
    baseUrl: https://geoacuity.monday.com
  slack:
    plugin: slack
    workspace: geoacuity
  github:
    plugin: github-cli
entities:
  geoacuity:
    name: GeoAcuity
    projects:
      workspace:
        name: GeoAcuity Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
  booz-allen-hamilton:
    name: Booz Allen Hamilton
    aliases: [booz]
    projects:
      egis:
        name: eGIS Project Plan
        surfaces:
          work:
            integration: monday
            kind: board
            id: "18204749659"
          discussion:
            integration: slack
            kind: channel
            id: C0B2EAX4RQC
          code:
            integration: github
            kind: repo
            id: GeoAcuity/example
            optional: true
`, 'utf8');

	const plan = parseJson<ProjectsSyncPlanResult>(run(['sync', 'projects', 'booz', 'egis', '--config', configPath, '--json']));
	assert.equal(plan.apply, false);
	assert.equal(plan.workspace, 'ws_geo');
	assert.equal(plan.policySurface, 'geoacuity/workspace:projects-app');
	assert.equal(plan.projectCount, 1);
	assert.equal(plan.linkCount, 3);
	assert.equal(plan.projects[0]?.payload.attributes.mereLinkKey, 'booz-allen-hamilton/egis');
	assert.equal(plan.links.find((link) => link.role === 'work')?.url, 'https://geoacuity.monday.com/boards/18204749659');
});

test('applies Mere Projects sync to configured records without updating rich fields', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	const logPath = path.join(dir, 'mere.log');
	const fakeMerePath = path.join(dir, 'fake-mere.mjs');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_geo
  monday:
    plugin: monday
    baseUrl: https://geoacuity.monday.com
entities:
  geoacuity:
    name: GeoAcuity
    projects:
      workspace:
        name: GeoAcuity Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
  booz-allen-hamilton:
    name: Booz Allen Hamilton
    projects:
      egis:
        name: eGIS Project Plan
        surfaces:
          mere-project:
            integration: mere
            kind: record
            id: prj_existing
          work:
            integration: monday
            kind: board
            id: "18204749659"
`, 'utf8');
	await writeFile(fakeMerePath, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const dataIndex = args.indexOf('--data');
const data = dataIndex >= 0 ? JSON.parse(args[dataIndex + 1]) : null;
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ args, data }) + '\\n');
if (args[0] === 'projects' && args[1] === 'project' && args[2] === 'list') {
  console.log(JSON.stringify([{ id: 'prj_existing', attributes: { existingKeep: true }, title: 'Existing eGIS', dateStart: '2024-01-01' }]));
} else if (args[0] === 'projects' && args[1] === 'project' && args[2] === 'update') {
  console.error('existing projects should not be updated');
  process.exit(2);
} else if (args[0] === 'projects' && args[1] === 'link' && args[2] === 'upsert') {
  console.log(JSON.stringify({ id: data.id, ok: true }));
} else {
  console.error('unexpected args: ' + args.join(' '));
  process.exit(2);
}
`, 'utf8');
	await chmod(fakeMerePath, 0o755);

	const result = parseJson<ProjectsSyncApplyResult>(run(['sync', 'projects', 'booz-allen-hamilton', 'egis', '--config', configPath, '--apply', '--mere-bin', fakeMerePath, '--json']));
	assert.equal(result.plan.projects[0]?.existingId, 'prj_existing');
	assert.equal(result.result.projects[0]?.action, 'matched');

	const calls = (await readFile(logPath, 'utf8')).trim().split('\n').map((line) => parseJson<FakeMereCall>(line));
	assert.equal(calls.some((call) => call.args.includes('update')), false);
	assert.equal(calls.some((call) => call.args.includes('create')), false);
	assert.ok(calls.find((call) => call.args.includes('upsert')));
});

test('denies Mere Projects sync without surface policy', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_geo
  monday:
    plugin: monday
entities:
  geoacuity:
    name: GeoAcuity
    projects:
      workspace:
        name: GeoAcuity Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
  booz-allen-hamilton:
    name: Booz Allen Hamilton
    projects:
      egis:
        name: eGIS Project Plan
        surfaces:
          work:
            integration: monday
            kind: board
            id: "18204749659"
`, 'utf8');

	const result = commandResult(['sync', 'projects', '--config', configPath, '--json']);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /sync denied/i);
});

test('rejects invalid integrations, kinds, write policies, and link endpoints', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');

	await writeFile(configPath, `schemaVersion: 1
integrations:
  mystery:
    plugin: mystery
entities: {}
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /Unknown integration plugin/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  monday:
    plugin: monday
entities:
  acme:
    projects:
      app:
        surfaces:
          work:
            integration: monday
            kind: repo
            id: bad-kind
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /does not support surface kind/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  slack:
    plugin: slack
entities:
  acme:
    projects:
      app:
        surfaces:
          work:
            integration: slack
            kind: channel
            id: C123
            policy:
              writes: [delete]
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /does not support write/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  url:
    plugin: url
entities:
  acme:
    projects:
      app:
        surfaces:
          docs:
            integration: url
            kind: link
            id: https://example.com
links:
  - from: missing-format
    to: acme/app:docs
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /Invalid link endpoint/);
});

test('rejects ambiguous aliases and protects existing config files from accidental overwrite', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	run(['config', 'init', '--workspace', 'ws_123', '--name', 'Acme', '--output', configPath, '--yes']);
	assert.match(commandResult(['config', 'init', '--workspace', 'ws_123', '--name', 'Acme', '--output', configPath]).stderr, /Refusing to overwrite/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  url:
    plugin: url
entities:
  alpha:
    name: Alpha
    aliases: [shared]
    projects:
      app:
        surfaces:
          docs:
            integration: url
            kind: link
            id: https://alpha.example
  beta:
    name: Beta
    aliases: [shared]
    projects:
      app:
        surfaces:
          docs:
            integration: url
            kind: link
            id: https://beta.example
`, 'utf8');
	assert.match(commandResult(['projects', 'list', 'shared', '--config', configPath]).stderr, /ambiguous/);
});

test('reports malformed snapshot and Mere CLI JSON at the boundary', async () => {
	const dir = await tempDir();
	const snapshotPath = path.join(dir, 'snapshot.json');
	const configPath = path.join(dir, 'mere.link.yaml');
	const fakeMerePath = path.join(dir, 'fake-mere.mjs');
	await writeFile(snapshotPath, '{', 'utf8');
	assert.match(commandResult(['generate', 'workspace', '--snapshot-file', snapshotPath]).stderr, /must be valid JSON/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_geo
  monday:
    plugin: monday
entities:
  geoacuity:
    name: GeoAcuity
    projects:
      workspace:
        name: GeoAcuity Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
  booz-allen-hamilton:
    name: Booz Allen Hamilton
    projects:
      egis:
        name: eGIS Project Plan
        surfaces:
          work:
            integration: monday
            kind: board
            id: "18204749659"
`, 'utf8');
	await writeFile(fakeMerePath, `#!/usr/bin/env node
console.log('not json');
`, 'utf8');
	await chmod(fakeMerePath, 0o755);

	const result = commandResult(['sync', 'projects', 'booz-allen-hamilton', 'egis', '--config', configPath, '--apply', '--mere-bin', fakeMerePath]);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /must be valid JSON/);
});
