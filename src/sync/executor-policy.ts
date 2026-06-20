import { normalizeKey } from '../domain/guards.js';
import type {
	ArgumentPredicate,
	ExecutorPolicyPlan,
	ExecutorPolicyRule,
	IntegrationConfig,
	JsonRecord,
	LinkConfigFile,
	ResourceGuard,
	SurfaceConfig
} from '../domain/types.js';

type SurfaceEntry = {
	path: string;
	entityKey: string;
	projectKey: string;
	role: string;
	integration: IntegrationConfig;
	surface: SurfaceConfig;
	namespace: string;
};

export type ExecutorInvocationAuthorization = {
	targets: Array<{ entity: string; project: string; surface: string }>;
};

const EXECUTOR_WRITE_PATTERNS: Record<string, string[]> = {
	github: ['github.issues.create', 'github.issues.update', 'github.issues.comment', 'github.pulls.create', 'github.pulls.update'],
	monday: ['monday.items.create', 'monday.items.update', 'monday.items.delete', 'monday.updates.create', 'monday.boards.create', 'monday.boards.update'],
	sharepoint: [
		'sharepoint.files.upload',
		'sharepoint.files.update',
		'sharepoint.files.delete',
		'sharepoint.pages.create',
		'sharepoint.pages.update',
		'sharepoint.pages.delete',
		'sharepoint.lists.items.create',
		'sharepoint.lists.items.update',
		'sharepoint.lists.items.delete'
	],
	imessage: [
		'imessage.messages.send',
		'imessage.messages.reply',
		'imessage.messages.react',
		'imessage.messages.unsend',
		'imessage.groups.update'
	],
	localai: [
		'localai.chat.completions.create',
		'localai.responses.create',
		'localai.embeddings.create',
		'localai.images.generate',
		'localai.audio.speech.create',
		'localai.audio.transcriptions.create'
	],
	slack: [
		'slack.messages.send',
		'slack.bookmarks.create',
		'slack.bookmarks.update',
		'slack.channels.setTopic',
		'slack.channels.setPurpose',
		'slack.conversations.canvases.create',
		'slack.canvases.edit',
		'slack.pins.add'
	]
};

const EXECUTOR_WRITE_PATTERNS_BY_WRITE: Record<string, Partial<Record<string, string[]>>> = {
	github: {
		create: ['github.issues.create', 'github.pulls.create'],
		update: ['github.issues.update', 'github.pulls.update'],
		comment: ['github.issues.comment'],
		sync: EXECUTOR_WRITE_PATTERNS.github
	},
	monday: {
		create: ['monday.items.create', 'monday.boards.create', 'monday.updates.create'],
		update: ['monday.items.update', 'monday.boards.update'],
		delete: ['monday.items.delete'],
		comment: ['monday.updates.create'],
		sync: EXECUTOR_WRITE_PATTERNS.monday
	},
	sharepoint: {
		create: ['sharepoint.files.upload', 'sharepoint.pages.create', 'sharepoint.lists.items.create'],
		update: ['sharepoint.files.update', 'sharepoint.pages.update', 'sharepoint.lists.items.update'],
		delete: ['sharepoint.files.delete', 'sharepoint.pages.delete', 'sharepoint.lists.items.delete'],
		sync: EXECUTOR_WRITE_PATTERNS.sharepoint
	},
	imessage: {
		message: ['imessage.messages.send', 'imessage.messages.reply', 'imessage.messages.react', 'imessage.messages.unsend'],
		update: ['imessage.groups.update'],
		sync: EXECUTOR_WRITE_PATTERNS.imessage
	},
	localai: {
		create: EXECUTOR_WRITE_PATTERNS.localai,
		message: ['localai.chat.completions.create', 'localai.responses.create'],
		sync: EXECUTOR_WRITE_PATTERNS.localai
	},
	slack: {
		topic: ['slack.channels.setTopic'],
		purpose: ['slack.channels.setPurpose'],
		canvas: ['slack.conversations.canvases.create', 'slack.canvases.edit'],
		bookmark: ['slack.bookmarks.create', 'slack.bookmarks.update'],
		message: ['slack.messages.send'],
		pin: ['slack.pins.add'],
		sync: EXECUTOR_WRITE_PATTERNS.slack
	}
};

export function executorNamespaceForIntegration(key: string, integration: IntegrationConfig): string | null {
	if (integration.plugin === 'executor') return integration.namespace ?? normalizeKey(key);
	return null;
}

export function executorNamespaceForSurface(config: LinkConfigFile, surface: SurfaceConfig): string | null {
	const integration = config.integrations[surface.integration];
	if (!integration) return null;
	return executorNamespaceForIntegration(surface.integration, integration);
}

export function executorWritePatternsForSurface(config: LinkConfigFile, surface: SurfaceConfig): string[] {
	const namespace = executorNamespaceForSurface(config, surface);
	if (!namespace) return [];
	if (surface.kind === 'tool') return [surface.id];
	return executorWritePatternsForSurfacePolicy(namespace, surface);
}

export function executorSurfaceUrl(config: LinkConfigFile, surface: SurfaceConfig): string | null {
	const integration = config.integrations[surface.integration];
	if (!integration) return null;
	const namespace = executorNamespaceForIntegration(surface.integration, integration);
	if (!namespace) return null;
	if (namespace === 'monday' && surface.kind === 'board') return `https://monday.com/boards/${encodeURIComponent(surface.id)}`;
	if (namespace === 'github' && surface.kind === 'repo') return `https://github.com/${surface.id}`;
	if (namespace === 'slack' && surface.kind === 'channel' && integration.workspace) return `https://${integration.workspace}.slack.com/archives/${surface.id}`;
	if (namespace === 'sharepoint' && ['site', 'document', 'list'].includes(surface.kind)) return sharePointUrl(surface.id);
	if (['link', 'document'].includes(surface.kind)) return httpUrl(surface.id);
	return null;
}

function httpUrl(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
	} catch {
		return null;
	}
}

function sharePointUrl(value: string): string | null {
	const direct = httpUrl(value);
	if (direct) return direct;
	const trimmed = value.trim().replace(/^\/+/u, '');
	if (!trimmed) return null;
	if (!trimmed.includes('.sharepoint.com')) return null;
	return `https://${trimmed}`;
}

function executorSurfaceEntries(config: LinkConfigFile): SurfaceEntry[] {
	const entries: SurfaceEntry[] = [];
	for (const [entityKey, entity] of Object.entries(config.entities)) {
		for (const [projectKey, project] of Object.entries(entity.projects)) {
			for (const [role, surface] of Object.entries(project.surfaces)) {
				const integration = config.integrations[surface.integration];
				if (!integration) continue;
				const namespace = executorNamespaceForIntegration(surface.integration, integration);
				if (!namespace) continue;
				entries.push({ path: `${entityKey}/${projectKey}:${role}`, entityKey, projectKey, role, integration, surface, namespace });
			}
		}
	}
	return entries;
}

function argumentEquals(path: string, value: string): ArgumentPredicate {
	return { path, operator: 'equals', value };
}

function resourceGuard(entry: SurfaceEntry): ResourceGuard | null {
	const id = entry.surface.id;
	if (entry.namespace === 'monday' && entry.surface.kind === 'board') {
		return {
			label: `${entry.path} board`,
			anyOf: [
				argumentEquals('boardId', id),
				argumentEquals('board_id', id),
				argumentEquals('board.id', id),
				argumentEquals('board.id.value', id)
			]
		};
	}
	if (entry.namespace === 'sharepoint' && entry.surface.kind === 'site') {
		return {
			label: `${entry.path} site`,
			anyOf: [
				argumentEquals('siteId', id),
				argumentEquals('site_id', id),
				argumentEquals('site', id),
				argumentEquals('siteUrl', id),
				argumentEquals('site_url', id)
			]
		};
	}
	if (entry.namespace === 'sharepoint' && entry.surface.kind === 'list') {
		return {
			label: `${entry.path} list`,
			anyOf: [argumentEquals('listId', id), argumentEquals('list_id', id), argumentEquals('list', id)]
		};
	}
	if (entry.namespace === 'github' && entry.surface.kind === 'repo') {
		return {
			label: `${entry.path} repo`,
			anyOf: [
				argumentEquals('repo', id),
				argumentEquals('repository', id),
				argumentEquals('repositoryId', id),
				argumentEquals('repository_id', id)
			]
		};
	}
	if (entry.namespace === 'slack' && entry.surface.kind === 'channel') {
		return {
			label: `${entry.path} channel`,
			anyOf: [argumentEquals('channel', id), argumentEquals('channelId', id), argumentEquals('channel_id', id)]
		};
	}
	if (entry.namespace === 'imessage' && ['source', 'channel', 'record'].includes(entry.surface.kind)) {
		return {
			label: `${entry.path} line`,
			anyOf: [
				argumentEquals('lineId', id),
				argumentEquals('line_id', id),
				argumentEquals('service', id),
				argumentEquals('capabilityId', id),
				argumentEquals('capability_id', id)
			]
		};
	}
	if (entry.namespace === 'localai' && ['source', 'namespace', 'model'].includes(entry.surface.kind)) {
		return {
			label: `${entry.path} capability`,
			anyOf: [
				argumentEquals('capabilityId', id),
				argumentEquals('capability_id', id),
				argumentEquals('model', id),
				argumentEquals('modelId', id),
				argumentEquals('model_id', id),
				argumentEquals('input.model', id),
				argumentEquals('request.model', id),
				argumentEquals('source', id),
				argumentEquals('runtime', id)
			]
		};
	}
	return null;
}

function executorWritePatternsForSurfacePolicy(namespace: string, surface: SurfaceConfig): string[] {
	const writes = surface.policy?.writes ?? [];
	if (writes.length === 0) return [];
	if (surface.kind === 'tool') return [surface.id];
	const byWrite = EXECUTOR_WRITE_PATTERNS_BY_WRITE[namespace] ?? {};
	return [...new Set(writes.flatMap((write) => byWrite[write] ?? []))];
}

function broadPolicySurface(entry: SurfaceEntry): boolean {
	return entry.surface.kind === 'tool' || entry.surface.kind === 'namespace' || entry.surface.kind === 'source';
}

function allExecutorWritePatternsForEntry(entry: SurfaceEntry): string[] {
	if (entry.surface.kind === 'tool') return [entry.surface.id];
	return EXECUTOR_WRITE_PATTERNS[entry.namespace] ?? [];
}

export function compileExecutorPolicy(config: LinkConfigFile, scopeId: string | null = null): ExecutorPolicyPlan {
	const entries = executorSurfaceEntries(config);
	const rules = new Map<string, ExecutorPolicyRule>();
	const entriesByNamespace = new Map<string, SurfaceEntry[]>();
	for (const entry of entries) {
		const namespaceEntries = entriesByNamespace.get(entry.namespace) ?? [];
		namespaceEntries.push(entry);
		entriesByNamespace.set(entry.namespace, namespaceEntries);
	}

	for (const [namespace, namespaceEntries] of entriesByNamespace.entries()) {
		const readPattern = `${namespace}.*`;
		rules.set(`approve:${readPattern}`, {
			pattern: readPattern,
			action: 'approve',
			reason: `Allow reads for declared ${namespace} surfaces.`,
			enforcement: 'executor',
			surfaces: namespaceEntries.map((entry) => entry.path),
			resourceGuards: []
		});

		const writePatterns = [...new Set(namespaceEntries.flatMap(allExecutorWritePatternsForEntry))];
		for (const pattern of writePatterns) {
			const writableEntries = namespaceEntries.filter((entry) => (
				executorWritePatternsForSurfacePolicy(namespace, entry.surface).includes(pattern) &&
				(Boolean(resourceGuard(entry)) || broadPolicySurface(entry))
			));
			const resourceGuards = writableEntries.map(resourceGuard).filter((guard): guard is ResourceGuard => Boolean(guard));
			const allowed = writableEntries.length > 0;
			rules.set(`${allowed ? 'require_approval' : 'block'}:${pattern}`, {
				pattern,
				action: allowed ? 'require_approval' : 'block',
				reason: allowed
					? `Require approval for ${namespace} writes granted by Link surface policy.`
					: `Block ${namespace} writes because no declared surface grants a matching write policy.`,
				enforcement: allowed && resourceGuards.length > 0 ? 'executor-and-link' : 'executor',
				surfaces: (allowed ? writableEntries : namespaceEntries).map((entry) => entry.path),
				resourceGuards
			});
		}
	}

	return {
		schemaVersion: 1,
		source: 'mere.link.yaml',
		scopeId,
		rules: [...rules.values()].sort((a, b) => a.pattern.localeCompare(b.pattern) || a.action.localeCompare(b.action))
	};
}

export function toolPatternMatches(pattern: string, toolId: string): boolean {
	if (pattern === '*') return true;
	if (pattern === toolId) return true;
	if (pattern.endsWith('.*')) {
		const prefix = pattern.slice(0, -2);
		return toolId === prefix || toolId.startsWith(`${prefix}.`);
	}
	return false;
}

function valueAtPath(record: JsonRecord, path: string): unknown {
	let current: unknown = record;
	for (const segment of path.split('.')) {
		if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
		current = (current as JsonRecord)[segment];
	}
	return current;
}

function scalarValue(value: unknown): string | null {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
	return null;
}

function argumentPredicateMatches(args: JsonRecord, predicate: ArgumentPredicate): boolean {
	const actual = scalarValue(valueAtPath(args, predicate.path));
	if (actual === null) return false;
	if (predicate.operator === 'equals') return actual === predicate.value;
	if (predicate.operator === 'notEquals') return actual !== predicate.value;
	if (predicate.operator === 'contains') return actual.includes(predicate.value);
	if (predicate.operator === 'startsWith') return actual.startsWith(predicate.value);
	return false;
}

function resourceGuardMatches(args: JsonRecord, guard: ResourceGuard): boolean {
	return guard.anyOf.some((predicate) => argumentPredicateMatches(args, predicate));
}

function broadInvocationSurface(entry: SurfaceEntry, toolId: string): boolean {
	if (entry.surface.kind === 'tool') return toolPatternMatches(entry.surface.id, toolId);
	return entry.surface.kind === 'namespace' || entry.surface.kind === 'source';
}

function localAiModelDiscoveryRead(entry: SurfaceEntry, toolId: string): boolean {
	return (
		entry.namespace === 'localai' &&
		['source', 'namespace'].includes(entry.surface.kind) &&
		(toolId === 'localai.models.list' || toolId === 'localai.models.retrieve')
	);
}

function guardedEntryMatches(entry: SurfaceEntry, toolId: string, args: JsonRecord): boolean {
	if (localAiModelDiscoveryRead(entry, toolId)) return true;
	const guard = resourceGuard(entry);
	if (guard) return resourceGuardMatches(args, guard);
	return broadInvocationSurface(entry, toolId);
}

function targetForEntry(entry: SurfaceEntry): ExecutorInvocationAuthorization['targets'][number] {
	return { entity: entry.entityKey, project: entry.projectKey, surface: entry.path };
}

function uniqueTargets(entries: SurfaceEntry[]): ExecutorInvocationAuthorization {
	const targets = new Map<string, ExecutorInvocationAuthorization['targets'][number]>();
	for (const entry of entries) targets.set(entry.path, targetForEntry(entry));
	return { targets: [...targets.values()] };
}

function ruleResourceMatches(args: JsonRecord, rule: ExecutorPolicyRule): boolean {
	if (rule.resourceGuards.length === 0) return true;
	return rule.resourceGuards.some((guard) => resourceGuardMatches(args, guard));
}

function namespaceForTool(toolId: string): string {
	return toolId.split('.')[0] ?? '';
}

function entriesForTool(config: LinkConfigFile, toolId: string): SurfaceEntry[] {
	const namespace = namespaceForTool(toolId);
	return executorSurfaceEntries(config).filter((entry) => entry.namespace === namespace || (entry.surface.kind === 'tool' && toolPatternMatches(entry.surface.id, toolId)));
}

function readableEntries(config: LinkConfigFile, toolId: string, args: JsonRecord): SurfaceEntry[] {
	const namespace = toolId.split('.')[0] ?? '';
	return executorSurfaceEntries(config).filter((entry) => {
		if (entry.surface.kind === 'tool') return toolPatternMatches(entry.surface.id, toolId);
		return entry.namespace === namespace && guardedEntryMatches(entry, toolId, args);
	});
}

function writableEntries(config: LinkConfigFile, toolId: string, args: JsonRecord): SurfaceEntry[] {
	return entriesForTool(config, toolId).filter((entry) => (
		executorWritePatternsForSurfacePolicy(entry.namespace, entry.surface).some((pattern) => toolPatternMatches(pattern, toolId)) &&
		guardedEntryMatches(entry, toolId, args)
	));
}

export function assertExecutorInvocationAllowed(config: LinkConfigFile, mode: 'read' | 'write', toolId: string, args: JsonRecord, apply: boolean): ExecutorInvocationAuthorization {
	if (mode === 'read') {
		const candidates = entriesForTool(config, toolId);
		if (candidates.length === 0) throw new Error(`Executor read denied. No declared Link surface grants namespace for ${toolId}.`);
		const matches = readableEntries(config, toolId, args);
		if (matches.length === 0) throw new Error(`Executor read denied. Arguments for ${toolId} do not match any declared readable Link surface.`);
		return uniqueTargets(matches);
	}
	if (!apply) throw new Error('Executor write denied. Re-run with --apply after reviewing the plan.');
	const plan = compileExecutorPolicy(config);
	const matches = plan.rules.filter((rule) => toolPatternMatches(rule.pattern, toolId));
	if (matches.some((rule) => rule.action === 'block')) throw new Error(`Executor write denied by compiled Link policy for ${toolId}.`);
	const allowed = matches.filter((rule) => rule.action === 'require_approval');
	if (allowed.length === 0) throw new Error(`Executor write denied. No compiled Link policy grants ${toolId}.`);
	if (!allowed.some((rule) => ruleResourceMatches(args, rule))) {
		throw new Error(`Executor write denied. Arguments for ${toolId} do not match any declared writable Link surface.`);
	}
	const entries = writableEntries(config, toolId, args);
	if (entries.length === 0) throw new Error(`Executor write denied. Arguments for ${toolId} do not match any declared writable Link surface.`);
	return uniqueTargets(entries);
}
