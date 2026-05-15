import process from 'node:process';
import { asArray, asRecord } from '../domain/guards.js';
import type {
	ExecutorPolicy,
	ExecutorPolicyPlan,
	ExecutorPolicyRule,
	ExecutorSource,
	ExecutorTool,
	ExecutorToolDescription,
	Flags,
	IntegrationConfig,
	JsonRecord,
	LinkConfigFile
} from '../domain/types.js';
import { stringFlag } from './args.js';
import { parseJson } from './json.js';

type ExecutorRuntime = {
	baseUrl: string;
	token?: string;
	scopeId?: string;
};

type ExecutorRequestOptions = {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	body?: JsonRecord;
};

type BaseUrlSource = 'flag' | 'config' | 'env' | 'default';

function normalizeBaseUrl(value: string): string {
	return value.replace(/\/+$/u, '');
}

function localExecutorUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
	} catch {
		return false;
	}
}

function firstExecutorIntegration(config: LinkConfigFile | undefined): IntegrationConfig | undefined {
	if (!config) return undefined;
	return config.integrations.executor ?? Object.values(config.integrations).find((integration) => integration.plugin === 'executor' && Boolean(integration.baseUrl));
}

function executorBaseUrl(flags: Flags, integration: IntegrationConfig | undefined): { value: string; source: BaseUrlSource } {
	const flagValue = stringFlag(flags, 'executor-base-url');
	if (flagValue) return { value: flagValue, source: 'flag' };
	if (integration?.baseUrl) return { value: integration.baseUrl, source: 'config' };
	const envValue = process.env.MERE_LINK_EXECUTOR_BASE_URL?.trim();
	if (envValue) return { value: envValue, source: 'env' };
	return { value: 'http://localhost:4788', source: 'default' };
}

function executorToken(flags: Flags, integration: IntegrationConfig | undefined, baseUrl: string, baseUrlSource: BaseUrlSource): string | undefined {
	const tokenEnv = stringFlag(flags, 'executor-token-env') ?? integration?.tokenEnv;
	if (tokenEnv) return process.env[tokenEnv]?.trim() || undefined;
	const token = process.env.MERE_LINK_EXECUTOR_TOKEN?.trim();
	if (!token) return undefined;
	if (baseUrlSource === 'config' && !localExecutorUrl(baseUrl)) {
		throw new Error('Refusing to send MERE_LINK_EXECUTOR_TOKEN to a non-local Executor baseUrl from config. Declare tokenEnv on the Executor integration or pass --executor-token-env for that runtime.');
	}
	return token;
}

export function executorRuntime(flags: Flags, config?: LinkConfigFile): ExecutorRuntime {
	const integration = firstExecutorIntegration(config);
	const baseUrl = executorBaseUrl(flags, integration);
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl.value);
	const token = executorToken(flags, integration, normalizedBaseUrl, baseUrl.source);
	return {
		baseUrl: normalizedBaseUrl,
		...(token ? { token } : {}),
		...(stringFlag(flags, 'executor-scope') ? { scopeId: stringFlag(flags, 'executor-scope') } : {})
	};
}

async function requestJson(runtime: ExecutorRuntime, path: string, options: ExecutorRequestOptions = {}): Promise<unknown> {
	const headers: Record<string, string> = { accept: 'application/json' };
	if (options.body) headers['content-type'] = 'application/json';
	if (runtime.token) headers.authorization = `Bearer ${runtime.token}`;
	const response = await fetch(`${runtime.baseUrl}${path}`, {
		method: options.method ?? 'GET',
		headers,
		...(options.body ? { body: JSON.stringify(options.body) } : {})
	});
	const body = await response.text();
	if (!response.ok) {
		const detail = body.trim() ? body.trim() : `${response.status} ${response.statusText}`;
		throw new Error(`Executor ${options.method ?? 'GET'} ${path} failed: ${detail}`);
	}
	if (!body.trim()) return null;
	return parseJson(body, `Executor ${path}`);
}

function scopeIdFromInfo(value: unknown): string {
	const record = asRecord(value, 'Executor scope response');
	const id = record.id;
	if (typeof id !== 'string' || !id.trim()) throw new Error('Executor scope response did not include an id.');
	return id;
}

export async function executorScopeId(flags: Flags, config?: LinkConfigFile): Promise<string> {
	const runtime = executorRuntime(flags, config);
	if (runtime.scopeId) return runtime.scopeId;
	return scopeIdFromInfo(await requestJson(runtime, '/api/scope'));
}

async function runtimeWithScope(flags: Flags, config?: LinkConfigFile): Promise<ExecutorRuntime & { scopeId: string }> {
	const runtime = executorRuntime(flags, config);
	if (runtime.scopeId) return { ...runtime, scopeId: runtime.scopeId };
	return { ...runtime, scopeId: scopeIdFromInfo(await requestJson(runtime, '/api/scope')) };
}

function scopedPath(scopeId: string, suffix: string): string {
	return `/api/scopes/${encodeURIComponent(scopeId)}${suffix}`;
}

function readRequiredResponseString(record: JsonRecord, key: string, label: string): string {
	const value = record[key];
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}.${key} is required.`);
	return value.trim();
}

function readOptionalResponseString(record: JsonRecord, key: string, label: string): string | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') throw new Error(`${label}.${key} must be a string.`);
	return value.trim() ? value.trim() : undefined;
}

function decodeResponseArray<T>(value: unknown, label: string, decode: (item: unknown, itemLabel: string) => T): T[] {
	return asArray(value, label).map((item, index) => decode(item, `${label}[${index}]`));
}

function decodeExecutorSource(value: unknown, label: string): ExecutorSource {
	const record = asRecord(value, label);
	const name = readOptionalResponseString(record, 'name', label);
	const kind = readOptionalResponseString(record, 'kind', label);
	const url = readOptionalResponseString(record, 'url', label);
	return {
		...record,
		id: readRequiredResponseString(record, 'id', label),
		...(name ? { name } : {}),
		...(kind ? { kind } : {}),
		...(url ? { url } : {})
	};
}

function decodeExecutorTool(value: unknown, label: string): ExecutorTool {
	const record = asRecord(value, label);
	const pluginId = readOptionalResponseString(record, 'pluginId', label);
	const sourceId = readOptionalResponseString(record, 'sourceId', label);
	const name = readOptionalResponseString(record, 'name', label);
	const description = readOptionalResponseString(record, 'description', label);
	return {
		...record,
		id: readRequiredResponseString(record, 'id', label),
		...(pluginId ? { pluginId } : {}),
		...(sourceId ? { sourceId } : {}),
		...(name ? { name } : {}),
		...(description ? { description } : {})
	};
}

function decodeExecutorToolDescription(value: unknown, label: string): ExecutorToolDescription {
	const record = asRecord(value, label);
	if (record.id !== undefined && record.id !== null) readOptionalResponseString(record, 'id', label);
	return record;
}

function decodeExecutorPolicy(value: unknown, label: string): ExecutorPolicy {
	const record = asRecord(value, label);
	const id = readOptionalResponseString(record, 'id', label);
	const scopeId = readOptionalResponseString(record, 'scopeId', label);
	return {
		...record,
		...(id ? { id } : {}),
		...(scopeId ? { scopeId } : {}),
		pattern: readRequiredResponseString(record, 'pattern', label),
		action: readRequiredResponseString(record, 'action', label)
	};
}

export async function listExecutorSources(flags: Flags, config?: LinkConfigFile): Promise<ExecutorSource[]> {
	const runtime = await runtimeWithScope(flags, config);
	return decodeResponseArray(await requestJson(runtime, scopedPath(runtime.scopeId, '/sources')), 'Executor sources', decodeExecutorSource);
}

export async function listExecutorTools(flags: Flags, config?: LinkConfigFile): Promise<ExecutorTool[]> {
	const runtime = await runtimeWithScope(flags, config);
	return decodeResponseArray(await requestJson(runtime, scopedPath(runtime.scopeId, '/tools')), 'Executor tools', decodeExecutorTool);
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export async function searchExecutorTools(flags: Flags, query: string, config?: LinkConfigFile): Promise<JsonRecord> {
	const normalized = query.trim().toLowerCase();
	const terms = normalized.split(/\s+/u).filter(Boolean);
	const tools = await listExecutorTools(flags, config);
	const matches = tools.filter((tool) => {
		const haystack = [tool.id, tool.pluginId, tool.sourceId, tool.name, tool.description].map(text).join(' ').toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
	return {
		query,
		count: matches.length,
		tools: matches
	};
}

export async function describeExecutorTool(flags: Flags, toolId: string, config?: LinkConfigFile): Promise<JsonRecord> {
	const runtime = await runtimeWithScope(flags, config);
	const schema = decodeExecutorToolDescription(
		await requestJson(runtime, scopedPath(runtime.scopeId, `/tools/${encodeURIComponent(toolId)}/schema`)),
		'Executor tool schema'
	);
	const metadata = (await listExecutorTools(flags, config)).find((tool) => tool.id === toolId);
	return {
		tool: metadata ?? { id: toolId },
		schema
	};
}

export async function listExecutorPolicies(flags: Flags, config?: LinkConfigFile): Promise<ExecutorPolicy[]> {
	const runtime = await runtimeWithScope(flags, config);
	return decodeResponseArray(await requestJson(runtime, scopedPath(runtime.scopeId, '/policies')), 'Executor policies', decodeExecutorPolicy);
}

function policyIdentity(policy: ExecutorPolicy): string {
	return `${typeof policy.pattern === 'string' ? policy.pattern : ''}:${typeof policy.action === 'string' ? policy.action : ''}`;
}

function executorPolicyRules(plan: ExecutorPolicyPlan): ExecutorPolicyRule[] {
	return plan.rules.filter((rule) => rule.enforcement === 'executor' || rule.enforcement === 'executor-and-link');
}

function conflictingPolicies(existing: ExecutorPolicy[], plan: ExecutorPolicyPlan): ExecutorPolicy[] {
	const plannedActions = new Map<string, Set<string>>();
	for (const rule of executorPolicyRules(plan)) {
		const actions = plannedActions.get(rule.pattern) ?? new Set<string>();
		actions.add(rule.action);
		plannedActions.set(rule.pattern, actions);
	}
	return existing.filter((policy) => {
		if (typeof policy.pattern !== 'string' || typeof policy.action !== 'string') return false;
		const actions = plannedActions.get(policy.pattern);
		return Boolean(actions) && !actions?.has(policy.action);
	});
}

export async function applyExecutorPolicy(flags: Flags, config: LinkConfigFile, plan: ExecutorPolicyPlan): Promise<JsonRecord> {
	const runtime = await runtimeWithScope(flags, config);
	const existing = await listExecutorPolicies(flags, config);
	const conflicts = conflictingPolicies(existing, plan);
	if (conflicts.length > 0) {
		const detail = conflicts
			.map((policy) => `${String(policy.pattern)} currently ${String(policy.action)}`)
			.join('; ');
		throw new Error(`Executor policy apply refused because existing runtime policies conflict with compiled Link policy: ${detail}. Remove stale runtime policies and re-run apply.`);
	}
	const existingIdentities = new Set(existing.map(policyIdentity));
	const created: JsonRecord[] = [];
	const skipped: JsonRecord[] = [];

	for (const rule of executorPolicyRules(plan)) {
		const identity = `${rule.pattern}:${rule.action}`;
		if (existingIdentities.has(identity)) {
			skipped.push({ pattern: rule.pattern, action: rule.action, reason: 'already-exists' });
			continue;
		}
		const result = decodeExecutorPolicy(await requestJson(runtime, scopedPath(runtime.scopeId, '/policies'), {
			method: 'POST',
			body: {
				targetScope: runtime.scopeId,
				pattern: rule.pattern,
				action: rule.action
			}
		}), 'Executor policy create response');
		created.push(result);
		existingIdentities.add(identity);
	}

	return {
		ok: true,
		scopeId: runtime.scopeId,
		created,
		skipped,
		planned: executorPolicyRules(plan).length
	};
}

function toolAccess(toolId: string): string {
	const segments = toolId.split('.').filter(Boolean);
	if (segments.length === 0) throw new Error('Executor tool id is required.');
	return segments.map((segment) => `[${JSON.stringify(segment)}]`).join('');
}

export async function invokeExecutorTool(flags: Flags, config: LinkConfigFile, toolId: string, args: JsonRecord): Promise<JsonRecord> {
	const runtime = executorRuntime(flags, config);
	const access = toolAccess(toolId);
	const code = [
		'async () => {',
		`  const __tool = tools${access};`,
		`  if (typeof __tool !== "function") throw new Error("Tool not found: " + ${JSON.stringify(toolId)});`,
		`  return await __tool(${JSON.stringify(args)});`,
		'}'
	].join('\n');
	return asRecord(await requestJson(runtime, '/api/executions', {
		method: 'POST',
		body: { code }
	}), 'Executor execution response');
}
