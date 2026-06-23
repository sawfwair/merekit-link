import assert from 'node:assert/strict';
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { normalizeConfig } from '../src/config/normalize.js';
import { assertExecutorInvocationAllowed } from '../src/sync/executor-policy.js';
import { parseYaml } from '../src/runtime/yaml.js';

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
	links: Array<{ role: string; url: string; kind: string }>;
};

type ProjectsSyncApplyResult = {
	plan: { projects: Array<{ existingId: string | null }> };
	result: { projects: Array<{ action: string }> };
};

type ExecutorPolicyCompileResult = {
	rules: Array<{
		pattern: string;
		action: string;
		enforcement: string;
		resourceGuards: Array<{
			label: string;
			anyOf: Array<{ path: string; operator: string; value: string }>;
		}>;
	}>;
};

type ExecutorApplyResult = {
	result: {
		scopeId: string;
		created: Array<{ pattern: string; action: string }>;
		skipped: Array<{ pattern: string; action: string }>;
	};
};

type ExecutorSearchResult = {
	count: number;
	tools: Array<{ id: string }>;
};

type OperatorPolicyResult = {
	policy: { defaultEffect: string; source: string };
	decision: {
		allowed: boolean;
		operator: { key: string; provider: string; client: string; accountClass: string; trustTier: string };
		capabilityDecisions: Array<{ capability: string; effect: string; matchedRule?: string; reason: string }>;
	};
};

type FakeExecutorCall = {
	method: string;
	path: string;
	authorization: string | null;
	data: Record<string, unknown> | null;
};

type FakeExecutorPolicy = {
	id: string;
	scopeId: string;
	pattern: string;
	action: string;
	position: string;
	createdAt: number;
	updatedAt: number;
	reason?: string;
	enforcement?: string;
	surfaces?: unknown;
	resourceGuards?: unknown;
};

type FakeExecutorOptions = {
	mode?: 'scoped' | 'modern';
	sources?: unknown;
	tools?: unknown;
	policies?: unknown;
	toolSchema?: unknown;
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

async function commandResultAsync(args: string[], options: RunOptions = {}): Promise<{ status: number | null; stdout: string; stderr: string }> {
	const child = spawn(process.execPath, [bin, ...args], {
		cwd: options.cwd ?? root,
		env: options.env ?? process.env,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	const stdout: Buffer[] = [];
	const stderr: Buffer[] = [];
	child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
	child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
	return new Promise((resolve, reject) => {
		child.on('error', reject);
		child.on('close', (status) => {
			resolve({
				status,
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8')
			});
		});
	});
}

function run(args: string[], options: RunOptions = {}): string {
	const result = commandResult(args, options);
	if (result.status !== 0) {
		throw new Error(`mere-link ${args.join(' ')} failed\n${result.stderr}${result.stdout}`);
	}
	return result.stdout;
}

async function runAsync(args: string[], options: RunOptions = {}): Promise<string> {
	const result = await commandResultAsync(args, options);
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

async function readRequestJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		const value: unknown = chunk;
		if (Buffer.isBuffer(value)) chunks.push(value);
		else if (typeof value === 'string') chunks.push(Buffer.from(value));
		else if (value instanceof Uint8Array) chunks.push(Buffer.from(value));
	}
	const body = Buffer.concat(chunks).toString('utf8').trim();
	return body ? parseJson<Record<string, unknown>>(body) : null;
}

function writeResponse(res: ServerResponse, status: number, value: unknown): void {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(value));
}

function writeExecutionResponse(res: ServerResponse, value: unknown): void {
	writeResponse(res, 200, {
		status: 'completed',
		text: JSON.stringify(value, null, 2),
		structured: { status: 'completed', result: value, logs: [] },
		isError: false
	});
}

function readExecutionToolArgs(code: string): Record<string, unknown> {
	const match = /return await __tool\((.+)\);/u.exec(code);
	return match ? parseJson<Record<string, unknown>>(match[1] ?? '{}') : {};
}

async function startFakeExecutor(options: FakeExecutorOptions = {}): Promise<{ baseUrl: string; calls: FakeExecutorCall[]; close: () => Promise<void> }> {
	const calls: FakeExecutorCall[] = [];
	const policies: FakeExecutorPolicy[] = [
		{ id: 'pol_existing', scopeId: 'scope_default', pattern: 'monday.*', action: 'approve', position: 'a0', createdAt: 1, updatedAt: 1 }
	];
	const server = createServer((req, res) => {
		void (async () => {
			const url = new URL(req.url ?? '/', 'http://127.0.0.1');
			const data = await readRequestJson(req);
			calls.push({ method: req.method ?? 'GET', path: url.pathname, authorization: req.headers.authorization ?? null, data });
			if (options.mode === 'modern') {
				if (req.method === 'GET' && url.pathname === '/api/tools') {
					writeResponse(res, 200, options.tools ?? [
						{ address: 'monday.workspace.items.update', integration: 'monday', connection: 'workspace', pluginId: 'mcp/monday', name: 'workspace.items.update', description: 'Update a Monday item' },
						{ address: 'sharepoint.docs.files.upload', integration: 'sharepoint', connection: 'docs', pluginId: 'mcp/microsoft-365', name: 'docs.files.upload', description: 'Upload a SharePoint file' }
					]);
					return;
				}
				if (req.method === 'POST' && url.pathname === '/api/executions') {
					const code = typeof data?.code === 'string' ? data.code : '';
					if (code.includes('coreTools.policies.list')) {
						writeExecutionResponse(res, { ok: true, data: { policies: options.policies ?? policies } });
						return;
					}
					if (code.includes('coreTools.policies.create')) {
						const args = readExecutionToolArgs(code);
						const pattern = typeof args.pattern === 'string' ? args.pattern : 'unknown.*';
						const action = typeof args.action === 'string' ? args.action : 'approve';
						const policy = {
							id: `pol_${policies.length + 1}`,
							scopeId: 'unscoped',
							pattern,
							action,
							...(typeof args.reason === 'string' ? { reason: args.reason } : {}),
							...(typeof args.enforcement === 'string' ? { enforcement: args.enforcement } : {}),
							...(Array.isArray(args.surfaces) ? { surfaces: args.surfaces } : {}),
							...(Array.isArray(args.resourceGuards) ? { resourceGuards: args.resourceGuards } : {}),
							position: `a${policies.length + 1}`,
							createdAt: 2,
							updatedAt: 2
						};
						policies.push(policy);
						writeExecutionResponse(res, { ok: true, data: { policy } });
						return;
					}
					writeExecutionResponse(res, { ok: true });
					return;
				}
				writeResponse(res, 404, { error: `not found: ${req.method ?? 'GET'} ${url.pathname}` });
				return;
			}
			if (req.method === 'GET' && url.pathname === '/api/scope') {
				writeResponse(res, 200, { id: 'scope_default', name: 'Default', dir: process.cwd(), stack: [] });
				return;
			}
			if (req.method === 'GET' && url.pathname === '/api/scopes/scope_default/sources') {
				writeResponse(res, 200, options.sources ?? [{ id: 'src_monday', name: 'Monday', kind: 'monday', url: 'https://monday.com' }]);
				return;
			}
			if (req.method === 'GET' && url.pathname === '/api/scopes/scope_default/tools') {
				writeResponse(res, 200, options.tools ?? [
					{ id: 'monday.items.update', pluginId: 'monday', sourceId: 'src_monday', name: 'Update item', description: 'Update a Monday item' },
					{ id: 'sharepoint.files.upload', pluginId: 'sharepoint', sourceId: 'src_sharepoint', name: 'Upload file', description: 'Upload a SharePoint file' }
				]);
				return;
			}
			if (req.method === 'GET' && url.pathname === '/api/scopes/scope_default/tools/monday.items.update/schema') {
				writeResponse(res, 200, options.toolSchema ?? { id: 'monday.items.update', inputSchema: { type: 'object', required: ['boardId'] } });
				return;
			}
			if (req.method === 'GET' && url.pathname === '/api/scopes/scope_default/policies') {
				writeResponse(res, 200, options.policies ?? policies);
				return;
			}
			if (req.method === 'POST' && url.pathname === '/api/scopes/scope_default/policies') {
				const record = data ?? {};
				const policy = {
					id: `pol_${policies.length + 1}`,
					scopeId: 'scope_default',
					pattern: String(record.pattern),
					action: String(record.action),
					...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
					...(typeof record.enforcement === 'string' ? { enforcement: record.enforcement } : {}),
					...(Array.isArray(record.surfaces) ? { surfaces: record.surfaces } : {}),
					...(Array.isArray(record.resourceGuards) ? { resourceGuards: record.resourceGuards } : {}),
					position: `a${policies.length + 1}`,
					createdAt: 2,
					updatedAt: 2
				};
				policies.push(policy);
				writeResponse(res, 200, policy);
				return;
			}
			if (req.method === 'POST' && url.pathname === '/api/executions') {
				writeResponse(res, 200, { status: 'completed', text: '', structured: { ok: true }, isError: false });
				return;
			}
			writeResponse(res, 404, { error: `not found: ${req.method ?? 'GET'} ${url.pathname}` });
		})().catch((error: unknown) => {
			writeResponse(res, 500, { error: error instanceof Error ? error.message : String(error) });
		});
	});
	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('fake executor did not bind a TCP port');
	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		calls,
		close: () => new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) reject(error);
				else resolve();
			});
		})
	};
}

test('prints a MereKit adapter manifest', () => {
	const manifest = parseJson<ManifestResult>(run(['commands', '--json']));
	assert.equal(manifest.namespace, 'link');
	assert.equal(manifest.auth.kind, 'none');
	assert.equal(manifest.commands.length, 21);
	assert.ok(manifest.commands.some((command) => command.id === 'generate.workspace'));
	assert.ok(manifest.commands.some((command) => command.id === 'sync.projects'));
	assert.ok(manifest.commands.some((command) => command.id === 'policy.evaluate'));
	assert.ok(manifest.commands.some((command) => command.id === 'executor.policy.compile'));
});

test('initializes, validates, and resolves a starter config', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	run(['config', 'init', '--workspace', 'ws_123', '--name', 'Example Org', '--output', configPath, '--yes']);

	const yaml = await readFile(configPath, 'utf8');
	assert.match(yaml, /plugin: mere/);
	assert.doesNotMatch(yaml, /work:\n\s+integration: mere\n\s+plugin:/);

	const validate = parseJson<ValidateResult>(run(['config', 'validate', '--config', configPath, '--json']));
	assert.equal(validate.ok, true);
	assert.equal(validate.summary.entities, 1);
	assert.deepEqual(validate.summary.roles, ['code', 'docs', 'work']);

	const context = parseJson<ContextResult>(run(['context', 'inspect', 'example-org', 'workspace', '--role', 'work', '--config', configPath, '--json']));
	assert.equal(context.entity.key, 'example-org');
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

test('validates Executor-backed product surfaces', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: http://localhost:4788
  monday:
    plugin: executor
    namespace: monday
    tokenEnv: MONDAY_API_KEY
  slack:
    plugin: executor
    namespace: slack
    workspace: workspace-team
entities:
  workspace-team:
    name: Workspace Team
    projects:
      field-mapping:
        name: Field Mapping
        surfaces:
          work:
            integration: monday
            kind: board
            id: "1234567890"
          discussion:
            integration: slack
            kind: channel
            id: C012EXAMPLE
            policy:
              writes: [topic, purpose, canvas, bookmark, message, pin]
`, 'utf8');

	const context = parseJson<ContextResult>(run(['context', 'inspect', 'workspace-team', 'field-mapping', '--role', 'work', '--config', configPath, '--json']));
	assert.equal(context.surface.plugin, 'executor');
	assert.equal(context.surface.kind, 'board');

	const plan = parseJson<ExecutorPolicyCompileResult>(run(['executor', 'policy', 'compile', '--config', configPath, '--json']));
	assert.ok(plan.rules.some((rule) => rule.pattern === 'slack.channels.setTopic' && rule.action === 'require_approval' && rule.enforcement === 'executor-and-link'));
	assert.ok(plan.rules.some((rule) => rule.pattern === 'slack.messages.send' && rule.action === 'require_approval'));
});

test('compiles Relay-backed iMessage and local AI write policy with resource guards', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
  imessage:
    plugin: executor
    namespace: imessage
  localai:
    plugin: executor
    namespace: localai
entities:
  personal:
    name: Personal Workspace
    projects:
      relay:
        name: Relay
        surfaces:
          messages:
            integration: imessage
            kind: source
            id: default
            policy:
              writes: [message]
          ai:
            integration: localai
            kind: source
            id: mere-run
            policy:
              writes: [create, message]
          psi-model:
            integration: localai
            kind: model
            id: psi
            policy:
              writes: [message]
`, 'utf8');

	const plan = parseJson<ExecutorPolicyCompileResult>(run(['executor', 'policy', 'compile', '--config', configPath, '--json']));
	const imessageSend = plan.rules.find((rule) => rule.pattern === 'imessage.messages.send');
	assert.equal(imessageSend?.action, 'require_approval');
	assert.equal(imessageSend?.enforcement, 'executor-and-link');
	assert.ok(imessageSend?.resourceGuards.some((guard) =>
		guard.anyOf.some((predicate) => predicate.path === 'line_id' && predicate.value === 'default')
	));

	const localChat = plan.rules.find((rule) => rule.pattern === 'localai.chat.completions.create');
	assert.equal(localChat?.action, 'require_approval');
	assert.equal(localChat?.enforcement, 'executor-and-link');
	assert.ok(localChat?.resourceGuards.some((guard) =>
		guard.anyOf.some((predicate) => predicate.path === 'capability_id' && predicate.value === 'mere-run')
	));
	assert.ok(localChat?.resourceGuards.some((guard) =>
		guard.anyOf.some((predicate) => predicate.path === 'model' && predicate.value === 'psi')
	));

	const config = normalizeConfig(parseYaml(await readFile(configPath, 'utf8'), configPath), configPath);
	const modelListRead = assertExecutorInvocationAllowed(config, 'read', 'localai.models.list', {}, false);
	assert.ok(modelListRead.targets.some((target) => target.surface.endsWith(':ai')));
	const modelRetrieveRead = assertExecutorInvocationAllowed(config, 'read', 'localai.models.retrieve', { modelId: 'text-chat-gemma4-turbo' }, false);
	assert.ok(modelRetrieveRead.targets.some((target) => target.surface.endsWith(':ai')));
	const modelWrite = assertExecutorInvocationAllowed(config, 'write', 'localai.chat.completions.create', { model: 'psi' }, true);
	assert.ok(modelWrite.targets.some((target) => target.surface.endsWith(':psi-model')));
	assert.throws(
		() => assertExecutorInvocationAllowed(config, 'write', 'localai.chat.completions.create', { model: 'not-declared' }, true),
		/Arguments for localai\.chat\.completions\.create do not match/
	);
});

test('validates Executor-backed Monday and SharePoint surfaces and compiles policy', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    runtime: local
    baseUrl: http://localhost:4788
  monday:
    plugin: executor
    namespace: monday
  sharepoint:
    plugin: executor
    namespace: sharepoint
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
          docs:
            integration: sharepoint
            kind: site
            id: example.sharepoint.com/sites/project
`, 'utf8');

	const context = parseJson<ContextResult>(run(['context', 'inspect', 'example-org', 'rollout', '--role', 'docs', '--config', configPath, '--json']));
	assert.equal(context.surface.plugin, 'executor');
	assert.equal(context.surface.kind, 'site');

	const plan = parseJson<ExecutorPolicyCompileResult>(run(['executor', 'policy', 'compile', '--config', configPath, '--json']));
	assert.ok(plan.rules.some((rule) => rule.pattern === 'monday.*' && rule.action === 'approve'));
	assert.ok(plan.rules.some((rule) => rule.pattern === 'monday.items.update' && rule.action === 'require_approval' && rule.enforcement === 'executor-and-link'));
	assert.ok(plan.rules.some((rule) => rule.pattern === 'sharepoint.files.upload' && rule.action === 'block'));
	const mondayUpdate = plan.rules.find((rule) => rule.pattern === 'monday.items.update');
	assert.ok(mondayUpdate);
	assert.equal('constraints' in mondayUpdate, false);
	assert.ok(
		mondayUpdate.resourceGuards.some((guard) =>
			guard.anyOf.some((predicate) => predicate.path === 'boardId' && predicate.operator === 'equals' && predicate.value === '1234567890')
		)
	);
});

test('resolves relative config paths from the original shell PWD', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	run(['config', 'init', '--workspace', 'ws_123', '--name', 'Example Org', '--output', configPath, '--yes']);

	const validate = parseJson<ValidateResult>(run(['config', 'validate', '--config', 'mere.link.yaml', '--json'], {
		cwd: path.dirname(bin),
		env: { ...process.env, PWD: dir }
	}));
	assert.equal(validate.ok, true);
	assert.equal(validate.path, configPath);
});

test('evaluates neutral operator policy with deny defaults and explicit deny precedence', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
operators:
  approved-agent:
    name: Approved Agent
    type: agent
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    accountId: example-managed-account
    trustTier: approved
    environment: local-cli
  untrusted-browser:
    name: Untrusted Browser
    type: external
    provider: public-runtime
    client: browser
    accountClass: personal
    trustTier: unknown
policy:
  defaultEffect: deny
  notes:
    - Operator identity gates project context export.
  rules:
    - id: deny-personal-operators
      effect: deny
      capabilities: ["*"]
      accountClasses: [personal, unknown]
      reason: Personal or unidentified accounts cannot receive project context.
    - id: allow-approved-agent
      effect: allow
      capabilities: [project.context.export, sync.plan, repo.documentation.write]
      providers: [managed-runtime]
      clients: [agent-shell]
      accountClasses: [org-managed]
      trustTiers: [approved]
      reason: Approved managed agents can inspect context and prepare documentation.
    - id: deny-code-write
      effect: deny
      capabilities: [repo.code.write]
      reason: Operators may review or document code, but may not write implementation code.
integrations:
  github:
    plugin: executor
    namespace: github
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          code:
            integration: github
            kind: repo
            id: example/repo
`, 'utf8');

	const allowed = parseJson<OperatorPolicyResult>(run(['policy', 'evaluate', 'example-org', 'rollout', '--config', configPath, '--operator', 'approved-agent', '--capability', 'project.context.export,sync.plan', '--json']));
	assert.equal(allowed.policy.source, 'root');
	assert.equal(allowed.decision.allowed, true);
	assert.deepEqual(allowed.decision.capabilityDecisions.map((decision) => decision.matchedRule), ['allow-approved-agent', 'allow-approved-agent']);

	const personal = commandResult(['policy', 'evaluate', 'example-org', 'rollout', '--config', configPath, '--operator', 'untrusted-browser', '--capability', 'project.context.export', '--json']);
	assert.equal(personal.status, 2);
	const deniedPersonal = parseJson<OperatorPolicyResult>(personal.stdout);
	assert.equal(deniedPersonal.decision.allowed, false);
	assert.equal(deniedPersonal.decision.capabilityDecisions[0]?.matchedRule, 'deny-personal-operators');

	const codeWrite = commandResult(['policy', 'evaluate', 'example-org', 'rollout', '--config', configPath, '--operator', 'approved-agent', '--capability', 'repo.code.write', '--json']);
	assert.equal(codeWrite.status, 2);
	const deniedCodeWrite = parseJson<OperatorPolicyResult>(codeWrite.stdout);
	assert.equal(deniedCodeWrite.decision.capabilityDecisions[0]?.matchedRule, 'deny-code-write');

	const override = parseJson<OperatorPolicyResult>(run(['policy', 'evaluate', 'example-org', 'rollout', '--config', configPath, '--operator', 'untrusted-browser', '--capability', 'project.context.export', '--override', '--json']));
	assert.equal(override.decision.allowed, true);
	assert.equal(override.decision.capabilityDecisions[0]?.matchedRule, 'operator-override');

	const taxonomy = parseJson<{ capabilities: string[] }>(run(['policy', 'taxonomy', '--json']));
	assert.ok(taxonomy.capabilities.includes('project.context.export'));
	assert.ok(taxonomy.capabilities.includes('repo.code.write'));
});

test('enforces configured operator policy on context export and sync planning', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
operators:
  approved-agent:
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: approved
  blocked-agent:
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: blocked
policy:
  defaultEffect: deny
  rules:
    - id: allow-approved-agent
      effect: allow
      capabilities: [project.context.export, sync.plan]
      providers: [managed-runtime]
      clients: [agent-shell]
      accountClasses: [org-managed]
      trustTiers: [approved]
integrations:
  mere:
    plugin: mere
    workspace: ws_example
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
          work:
            integration: mere
            kind: workspace
            id: ws_example
`, 'utf8');

	const deniedContext = commandResult(['context', 'inspect', 'example-org', 'rollout', '--config', configPath, '--operator', 'blocked-agent', '--json']);
	assert.notEqual(deniedContext.status, 0);
	assert.match(deniedContext.stderr, /Operator policy denied/);

	const deniedSync = commandResult(['sync', 'projects', 'example-org', 'rollout', '--config', configPath, '--operator', 'blocked-agent', '--json']);
	assert.notEqual(deniedSync.status, 0);
	assert.match(deniedSync.stderr, /Operator policy denied/);

	const allowedContext = parseJson<ContextResult>(run(['context', 'inspect', 'example-org', 'rollout', '--config', configPath, '--operator', 'approved-agent', '--json']));
	assert.equal(allowedContext.project.key, 'rollout');
	const allowedSync = parseJson<ProjectsSyncPlanResult>(run(['sync', 'projects', 'example-org', 'rollout', '--config', configPath, '--operator', 'approved-agent', '--json']));
	assert.equal(allowedSync.projectCount, 1);
});

test('plans Mere Projects materialization with explicit sync policy', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_example
  executor:
    plugin: executor
  monday:
    plugin: executor
    namespace: monday
  slack:
    plugin: executor
    namespace: slack
    workspace: workspace-team
  github:
    plugin: executor
    namespace: github
entities:
  workspace-team:
    name: Workspace Team
    projects:
      workspace:
        name: Workspace Team Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
  example-client:
    name: Example Client
    aliases: [client]
    projects:
      field-mapping:
        name: Field Mapping Project Plan
        surfaces:
          work:
            integration: monday
            kind: board
            id: "1234567890"
          discussion:
            integration: slack
            kind: channel
            id: C012EXAMPLE
          code:
            integration: github
            kind: repo
            id: ExampleOrg/example
            optional: true
`, 'utf8');

	const plan = parseJson<ProjectsSyncPlanResult>(run(['sync', 'projects', 'client', 'field-mapping', '--config', configPath, '--json']));
	assert.equal(plan.apply, false);
	assert.equal(plan.workspace, 'ws_example');
	assert.equal(plan.policySurface, 'workspace-team/workspace:projects-app');
	assert.equal(plan.projectCount, 1);
	assert.equal(plan.linkCount, 3);
	assert.equal(plan.projects[0]?.payload.attributes.mereLinkKey, 'example-client/field-mapping');
	assert.equal(plan.links.find((link) => link.role === 'work')?.url, 'https://monday.com/boards/1234567890');
	assert.equal(plan.links.find((link) => link.role === 'discussion')?.kind, 'slack.channel');
	assert.equal(plan.links.find((link) => link.role === 'code')?.kind, 'github.repo');
});

test('plans Executor-backed Monday and SharePoint links', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_example
  executor:
    plugin: executor
    baseUrl: http://localhost:4788
  monday:
    plugin: executor
    namespace: monday
  sharepoint:
    plugin: executor
    namespace: sharepoint
entities:
  example-org:
    name: Example Organization
    projects:
      workspace:
        name: Example Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
      rollout:
        name: Rollout
        surfaces:
          work:
            integration: monday
            kind: board
            id: "1234567890"
          docs:
            integration: sharepoint
            kind: site
            id: example.sharepoint.com/sites/project
`, 'utf8');

	const plan = parseJson<ProjectsSyncPlanResult>(run(['sync', 'projects', 'example-org', 'rollout', '--config', configPath, '--json']));
	assert.equal(plan.linkCount, 2);
	assert.equal(plan.links.find((link) => link.role === 'work')?.url, 'https://monday.com/boards/1234567890');
	assert.equal(plan.links.find((link) => link.role === 'docs')?.url, 'https://example.sharepoint.com/sites/project');
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
    workspace: ws_example
  executor:
    plugin: executor
  monday:
    plugin: executor
    namespace: monday
entities:
  workspace-team:
    name: Workspace Team
    projects:
      workspace:
        name: Workspace Team Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
  example-client:
    name: Example Client
    projects:
      field-mapping:
        name: Field Mapping Project Plan
        surfaces:
          mere-project:
            integration: mere
            kind: record
            id: prj_existing
          work:
            integration: monday
            kind: board
            id: "1234567890"
`, 'utf8');
	await writeFile(fakeMerePath, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const dataIndex = args.indexOf('--data');
const data = dataIndex >= 0 ? JSON.parse(args[dataIndex + 1]) : null;
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ args, data }) + '\\n');
if (args[0] === 'projects' && args[1] === 'project' && args[2] === 'list') {
  console.log(JSON.stringify([{ id: 'prj_existing', attributes: { existingKeep: true }, title: 'Existing Field Mapping', dateStart: '2024-01-01' }]));
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

	const result = parseJson<ProjectsSyncApplyResult>(run(['sync', 'projects', 'example-client', 'field-mapping', '--config', configPath, '--apply', '--mere-bin', fakeMerePath, '--json']));
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
    workspace: ws_example
  executor:
    plugin: executor
  monday:
    plugin: executor
    namespace: monday
entities:
  workspace-team:
    name: Workspace Team
    projects:
      workspace:
        name: Workspace Team Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
  example-client:
    name: Example Client
    projects:
      field-mapping:
        name: Field Mapping Project Plan
        surfaces:
          work:
            integration: monday
            kind: board
            id: "1234567890"
`, 'utf8');

	const result = commandResult(['sync', 'projects', '--config', configPath, '--json']);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /sync denied/i);
});

test('uses the Executor runtime boundary for sources, tool search, describe, and policy apply', async () => {
	const fake = await startFakeExecutor();
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: ${fake.baseUrl}
  monday:
    plugin: executor
    namespace: monday
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
`, 'utf8');

		const sources = parseJson<Array<{ id: string }>>(await runAsync(['executor', 'sources', '--executor-base-url', fake.baseUrl, '--json']));
		assert.equal(sources[0]?.id, 'src_monday');

		const search = parseJson<ExecutorSearchResult>(await runAsync(['executor', 'tools', 'search', 'monday item', '--executor-base-url', fake.baseUrl, '--json']));
		assert.equal(search.count, 1);
		assert.equal(search.tools[0]?.id, 'monday.items.update');

		const describe = parseJson<{ schema: { id: string; inputSchema: { required: string[] } } }>(await runAsync(['executor', 'tools', 'describe', 'monday.items.update', '--executor-base-url', fake.baseUrl, '--json']));
		assert.equal(describe.schema.id, 'monday.items.update');
		assert.deepEqual(describe.schema.inputSchema.required, ['boardId']);

		const applyWithoutYes = commandResult(['executor', 'policy', 'apply', '--config', configPath, '--executor-base-url', fake.baseUrl, '--json']);
		assert.notEqual(applyWithoutYes.status, 0);
		assert.match(applyWithoutYes.stderr, /requires --yes/);

		const applied = parseJson<ExecutorApplyResult>(await runAsync(['executor', 'policy', 'apply', '--config', configPath, '--executor-base-url', fake.baseUrl, '--yes', '--json']));
		assert.equal(applied.result.scopeId, 'scope_default');
		assert.ok(applied.result.skipped.some((policy) => policy.pattern === 'monday.*' && policy.action === 'approve'));
		assert.ok(applied.result.created.some((policy) => policy.pattern === 'monday.items.update' && policy.action === 'require_approval'));
		const createPolicyCall = fake.calls.find((call) => call.method === 'POST' && call.path === '/api/scopes/scope_default/policies' && call.data?.pattern === 'monday.items.update');
		assert.equal(createPolicyCall?.data?.enforcement, 'executor-and-link');
		assert.ok(Array.isArray(createPolicyCall?.data?.resourceGuards));
		assert.ok((createPolicyCall.data.resourceGuards as Array<{ anyOf: Array<{ path: string; value: string }> }>).some((guard) =>
			guard.anyOf.some((predicate) => predicate.path === 'boardId' && predicate.value === '1234567890')
		));
	} finally {
		await fake.close();
	}
});

test('uses the modern Executor runtime boundary when scoped endpoints are absent', async () => {
	const fake = await startFakeExecutor({ mode: 'modern' });
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: ${fake.baseUrl}
  monday:
    plugin: executor
    namespace: monday
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
`, 'utf8');

		const sources = parseJson<Array<{ id: string; toolCount: number }>>(await runAsync(['executor', 'sources', '--executor-base-url', fake.baseUrl, '--json']));
		assert.equal(sources.find((source) => source.id === 'monday')?.toolCount, 1);

		const search = parseJson<ExecutorSearchResult>(await runAsync(['executor', 'tools', 'search', 'monday item', '--executor-base-url', fake.baseUrl, '--json']));
		assert.equal(search.count, 1);
		assert.equal(search.tools[0]?.id, 'monday.workspace.items.update');

		const describe = parseJson<{ schema: { id: string; integration: string } }>(await runAsync(['executor', 'tools', 'describe', 'monday.workspace.items.update', '--executor-base-url', fake.baseUrl, '--json']));
		assert.equal(describe.schema.id, 'monday.workspace.items.update');
		assert.equal(describe.schema.integration, 'monday');

		const applied = parseJson<ExecutorApplyResult>(await runAsync(['executor', 'policy', 'apply', '--config', configPath, '--executor-base-url', fake.baseUrl, '--yes', '--json']));
		assert.equal(applied.result.scopeId, 'unscoped');
		assert.ok(applied.result.skipped.some((policy) => policy.pattern === 'monday.*' && policy.action === 'approve'));
		assert.ok(applied.result.created.some((policy) => policy.pattern === 'monday.items.update' && policy.action === 'require_approval'));
		assert.ok(fake.calls.some((call) => call.path === '/api/tools'));
		const createPolicyExecution = fake.calls.find((call) => call.method === 'POST' && call.path === '/api/executions' && typeof call.data?.code === 'string' && call.data.code.includes('coreTools.policies.create'));
		assert.ok(createPolicyExecution);
		assert.match(String(createPolicyExecution.data?.code), /"resourceGuards":\[/);
		assert.match(String(createPolicyExecution.data?.code), /"boardId"/);
	} finally {
		await fake.close();
	}
});

test('refuses to forward the global Executor token to config-selected remote runtimes', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: https://executor.example.com
entities: {}
`, 'utf8');

	const result = commandResult(['executor', 'sources', '--config', configPath, '--json'], {
		env: { ...process.env, MERE_LINK_EXECUTOR_TOKEN: 'sentinel-secret-token' }
	});
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Refusing to send MERE_LINK_EXECUTOR_TOKEN/);
});

test('refuses config-selected tokenEnv for non-local Executor runtimes', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: https://executor.example.com
    tokenEnv: AWS_SECRET_ACCESS_KEY
entities: {}
`, 'utf8');

	const result = commandResult(['executor', 'sources', '--config', configPath, '--json'], {
		env: { ...process.env, AWS_SECRET_ACCESS_KEY: 'sentinel-secret-token' }
	});
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /config-selected Executor tokenEnv/);
});

test('fails closed when runtime policies conflict with compiled Link policy', async () => {
	const fake = await startFakeExecutor({
		policies: [
			{ id: 'pol_existing', scopeId: 'scope_default', pattern: 'monday.items.update', action: 'require_approval' }
		]
	});
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: ${fake.baseUrl}
  monday:
    plugin: executor
    namespace: monday
entities:
  example-org:
    projects:
      rollout:
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
`, 'utf8');

		const result = await commandResultAsync(['executor', 'policy', 'apply', '--config', configPath, '--executor-base-url', fake.baseUrl, '--yes', '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /existing runtime policies conflict/);
		assert.equal(fake.calls.some((call) => call.method === 'POST' && call.path.endsWith('/policies')), false);
	} finally {
		await fake.close();
	}
});

test('fails closed when runtime policies are missing compiled Link resource guards', async () => {
	const fake = await startFakeExecutor({
		policies: [
			{ id: 'pol_existing_read', scopeId: 'scope_default', pattern: 'monday.*', action: 'approve' },
			{ id: 'pol_existing_write', scopeId: 'scope_default', pattern: 'monday.items.update', action: 'require_approval' }
		]
	});
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: ${fake.baseUrl}
  monday:
    plugin: executor
    namespace: monday
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
`, 'utf8');

		const result = await commandResultAsync(['executor', 'policy', 'apply', '--config', configPath, '--executor-base-url', fake.baseUrl, '--yes', '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /without matching resourceGuards/);
		assert.equal(fake.calls.some((call) => call.method === 'POST' && call.path.endsWith('/policies')), false);
	} finally {
		await fake.close();
	}
});

test('rejects malformed Executor runtime responses at the boundary', async () => {
	const badSources = await startFakeExecutor({ sources: [{ name: 'Missing id' }] });
	try {
		const result = await commandResultAsync(['executor', 'sources', '--executor-base-url', badSources.baseUrl, '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Executor sources\[0\]\.id is required/);
	} finally {
		await badSources.close();
	}

	const badTools = await startFakeExecutor({ tools: [{ name: 'Missing id' }] });
	try {
		const result = await commandResultAsync(['executor', 'tools', 'search', 'monday', '--executor-base-url', badTools.baseUrl, '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Executor tools\[0\]\.id is required/);
	} finally {
		await badTools.close();
	}

	const badPolicies = await startFakeExecutor({ policies: [{ id: 'pol_bad', action: 'approve' }] });
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
integrations:
  executor:
    plugin: executor
    baseUrl: ${badPolicies.baseUrl}
  monday:
    plugin: executor
    namespace: monday
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
`, 'utf8');

		const result = await commandResultAsync(['executor', 'policy', 'apply', '--config', configPath, '--executor-base-url', badPolicies.baseUrl, '--yes', '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Executor policies\[0\]\.pattern is required/);
	} finally {
		await badPolicies.close();
	}
});

test('guards Executor write invocation with Link policy, apply, and resource guards', async () => {
	const fake = await startFakeExecutor();
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
operators:
  approved-agent:
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: approved
  blocked-agent:
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: blocked
policy:
  defaultEffect: deny
  rules:
    - id: allow-approved-agent
      effect: allow
      capabilities: [executor.tool.write]
      providers: [managed-runtime]
      clients: [agent-shell]
      accountClasses: [org-managed]
      trustTiers: [approved]
integrations:
  executor:
    plugin: executor
    baseUrl: ${fake.baseUrl}
  monday:
    plugin: executor
    namespace: monday
entities:
  example-org:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
`, 'utf8');

		const noApply = commandResult(['executor', 'invoke', 'write', 'monday.items.update', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"boardId":"1234567890"}', '--operator', 'approved-agent', '--json']);
		assert.notEqual(noApply.status, 0);
		assert.match(noApply.stderr, /--apply/);

		const wrongBoard = commandResult(['executor', 'invoke', 'write', 'monday.items.update', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"boardId":"wrong"}', '--operator', 'approved-agent', '--apply', '--json']);
		assert.notEqual(wrongBoard.status, 0);
		assert.match(wrongBoard.stderr, /do not match/);

		const blockedOperator = commandResult(['executor', 'invoke', 'write', 'monday.items.update', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"boardId":"1234567890"}', '--operator', 'blocked-agent', '--apply', '--json']);
		assert.notEqual(blockedOperator.status, 0);
		assert.match(blockedOperator.stderr, /Operator policy denied/);

		const allowed = parseJson<{ status: string; structured: { ok: boolean } }>(await runAsync(['executor', 'invoke', 'write', 'monday.items.update', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"boardId":"1234567890"}', '--operator', 'approved-agent', '--apply', '--json']));
		assert.equal(allowed.status, 'completed');
		assert.equal(allowed.structured.ok, true);
		assert.ok(fake.calls.some((call) => call.method === 'POST' && call.path === '/api/executions'));
	} finally {
		await fake.close();
	}
});

test('guards Executor read invocation with resource guards and operator policy', async () => {
	const fake = await startFakeExecutor();
	try {
		const dir = await tempDir();
		const configPath = path.join(dir, 'mere.link.yaml');
		await writeFile(configPath, `schemaVersion: 1
operators:
  approved-agent:
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: approved
  blocked-agent:
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: blocked
policy:
  defaultEffect: deny
  rules:
    - id: allow-approved-agent
      effect: allow
      capabilities: [executor.tool.read]
      providers: [managed-runtime]
      clients: [agent-shell]
      accountClasses: [org-managed]
      trustTiers: [approved]
integrations:
  executor:
    plugin: executor
    baseUrl: ${fake.baseUrl}
  github:
    plugin: executor
    namespace: github
entities:
  example-org:
    projects:
      rollout:
        surfaces:
          code:
            integration: github
            kind: repo
            id: allowed/repo
`, 'utf8');

		const wrongRepo = commandResult(['executor', 'invoke', 'read', 'github.issues.list', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"repo":"other/private"}', '--operator', 'approved-agent', '--json']);
		assert.notEqual(wrongRepo.status, 0);
		assert.match(wrongRepo.stderr, /readable Link surface/);

		const blockedOperator = commandResult(['executor', 'invoke', 'read', 'github.issues.list', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"repo":"allowed/repo"}', '--operator', 'blocked-agent', '--json']);
		assert.notEqual(blockedOperator.status, 0);
		assert.match(blockedOperator.stderr, /Operator policy denied/);

		const allowed = parseJson<{ status: string; structured: { ok: boolean } }>(await runAsync(['executor', 'invoke', 'read', 'github.issues.list', '--config', configPath, '--executor-base-url', fake.baseUrl, '--data', '{"repo":"allowed/repo"}', '--operator', 'approved-agent', '--json']));
		assert.equal(allowed.status, 'completed');
		assert.ok(fake.calls.some((call) => call.method === 'POST' && call.path === '/api/executions' && String(call.data?.code).includes('allowed/repo')));
	} finally {
		await fake.close();
	}
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
    plugin: executor
    namespace: monday
entities:
  example-org:
    projects:
      app:
        surfaces:
          work:
            integration: monday
            kind: workspace
            id: bad-kind
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /does not support surface kind/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  url:
    plugin: url
entities:
  example-org:
    projects:
      app:
        surfaces:
          work:
            integration: url
            kind: link
            id: https://example.com
            policy:
              writes: [delete]
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /does not support write/);

	await writeFile(configPath, `schemaVersion: 1
policy:
  defaultEffect: maybe
  rules:
    - effect: allow
      capabilities: [project.context.export]
integrations:
  url:
    plugin: url
entities: {}
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /defaultEffect/);

	await writeFile(configPath, `schemaVersion: 1
policy:
  rules:
    - effect: allow
      capabilities: []
integrations:
  url:
    plugin: url
entities: {}
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /capabilities/);

	await writeFile(configPath, `schemaVersion: 1
integrations:
  url:
    plugin: url
entities:
  example-org:
    projects:
      app:
        surfaces:
          docs:
            integration: url
            kind: link
            id: https://example.com
links:
  - from: missing-format
    to: example-org/app:docs
`, 'utf8');
	assert.match(commandResult(['config', 'validate', '--config', configPath]).stderr, /Invalid link endpoint/);
});

test('rejects ambiguous aliases and protects existing config files from accidental overwrite', async () => {
	const dir = await tempDir();
	const configPath = path.join(dir, 'mere.link.yaml');
	run(['config', 'init', '--workspace', 'ws_123', '--name', 'Example Org', '--output', configPath, '--yes']);
	assert.match(commandResult(['config', 'init', '--workspace', 'ws_123', '--name', 'Example Org', '--output', configPath]).stderr, /Refusing to overwrite/);

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
    workspace: ws_example
  executor:
    plugin: executor
  monday:
    plugin: executor
    namespace: monday
entities:
  workspace-team:
    name: Workspace Team
    projects:
      workspace:
        name: Workspace Team Workspace
        surfaces:
          projects-app:
            integration: mere
            kind: app
            id: projects
            policy:
              writes: [sync]
  example-client:
    name: Example Client
    projects:
      field-mapping:
        name: Field Mapping Project Plan
        surfaces:
          work:
            integration: monday
            kind: board
            id: "1234567890"
`, 'utf8');
	await writeFile(fakeMerePath, `#!/usr/bin/env node
console.log('not json');
`, 'utf8');
	await chmod(fakeMerePath, 0o755);

	const result = commandResult(['sync', 'projects', 'example-client', 'field-mapping', '--config', configPath, '--apply', '--mere-bin', fakeMerePath]);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /must be valid JSON/);

	await writeFile(fakeMerePath, `#!/usr/bin/env node
console.log(JSON.stringify([{ id: 123, attributes: {} }]));
`, 'utf8');
	await chmod(fakeMerePath, 0o755);

	const malformedList = commandResult(['sync', 'projects', 'example-client', 'field-mapping', '--config', configPath, '--apply', '--mere-bin', fakeMerePath]);
	assert.notEqual(malformedList.status, 0);
	assert.match(malformedList.stderr, /Mere Projects project list\[0\]\.id must be a string/);
});
