#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { loadConfig, writeConfigOutput } from './config/file.js';
import { buildContext, entityRows, normalizeConfig, projectRows, summarize, surfaceRows } from './config/normalize.js';
import { configFromWorkspaceSnapshot, starterConfig } from './config/starter.js';
import { HELP_TEXT, VERSION, manifest, renderCompletion } from './manifest.js';
import { boolFlag, parseArgs, stringFlag } from './runtime/args.js';
import {
	applyExecutorPolicy,
	describeExecutorTool,
	invokeExecutorTool,
	listExecutorSources,
	searchExecutorTools
} from './runtime/executor.js';
import { parseJsonRecord } from './runtime/json.js';
import { readSnapshot } from './runtime/mere.js';
import { printTable, writeJson, writeText } from './runtime/output.js';
import { assertExecutorInvocationAllowed, compileExecutorPolicy } from './sync/executor-policy.js';
import { applyProjectsSyncPlan, buildProjectsSyncPlan } from './sync/projects.js';
import type { JsonRecord } from './domain/types.js';

async function handleConfigInit(flags: ReturnType<typeof parseArgs>['flags']): Promise<number> {
	const config = starterConfig({ workspace: stringFlag(flags, 'workspace'), name: stringFlag(flags, 'name') });
	const output = await writeConfigOutput(config, flags);
	if (boolFlag(flags, 'json')) writeJson({ ok: true, path: output.path, config });
	else writeText(output.wrote ? `Wrote ${output.path}` : output.yaml);
	return 0;
}

async function handleGenerateWorkspace(flags: ReturnType<typeof parseArgs>['flags']): Promise<number> {
	const snapshot = await readSnapshot(flags);
	const config = configFromWorkspaceSnapshot(snapshot, { workspace: stringFlag(flags, 'workspace'), name: stringFlag(flags, 'name') });
	const output = await writeConfigOutput(config, flags);
	if (boolFlag(flags, 'json')) writeJson({ ok: true, path: output.path, config, source: stringFlag(flags, 'snapshot-file') ? 'snapshot-file' : 'mere-workspace-snapshot' });
	else writeText(output.wrote ? `Wrote ${output.path}` : output.yaml);
	return 0;
}

async function handleConfigRead(action: string | undefined, flags: ReturnType<typeof parseArgs>['flags']): Promise<number | null> {
	if (action === 'validate') {
		const loaded = await loadConfig(flags);
		if (boolFlag(flags, 'json')) writeJson({ ok: true, path: loaded.path, summary: summarize(loaded.config) });
		else writeText(`Config OK: ${loaded.path}`);
		return 0;
	}
	if (action === 'inspect') {
		const loaded = await loadConfig(flags);
		if (boolFlag(flags, 'json')) writeJson({ path: loaded.path, summary: summarize(loaded.config), config: loaded.config });
		else printTable([summarize(loaded.config)], ['integrations', 'entities', 'projects', 'surfaces', 'links', 'roles']);
		return 0;
	}
	return null;
}

async function handleListCommands(group: string, action: string | undefined, rest: string[], flags: ReturnType<typeof parseArgs>['flags']): Promise<number | null> {
	if (group === 'entities' && action === 'list') {
		const { config } = await loadConfig(flags);
		const rows = entityRows(config);
		if (boolFlag(flags, 'json')) writeJson(rows);
		else printTable(rows, ['key', 'name', 'aliases', 'projects']);
		return 0;
	}
	if (group === 'projects' && action === 'list') {
		const { config } = await loadConfig(flags);
		const rows = projectRows(config, rest[0]);
		if (boolFlag(flags, 'json')) writeJson(rows);
		else printTable(rows, ['entity', 'key', 'name', 'aliases', 'surfaces']);
		return 0;
	}
	if (group === 'surfaces' && action === 'list') {
		const { config } = await loadConfig(flags);
		const rows = surfaceRows(config, rest[0], rest[1]);
		if (boolFlag(flags, 'json')) writeJson(rows);
		else printTable(rows, ['entity', 'project', 'role', 'integration', 'plugin', 'kind', 'id', 'optional']);
		return 0;
	}
	if (group === 'links' && action === 'list') {
		const { config } = await loadConfig(flags);
		if (boolFlag(flags, 'json')) writeJson(config.links);
		else printTable(config.links.map((link) => ({ label: link.label ?? '', from: link.from, to: link.to })), ['label', 'from', 'to']);
		return 0;
	}
	return null;
}

async function handleContextInspect(rest: string[], flags: ReturnType<typeof parseArgs>['flags']): Promise<number> {
	const entity = rest[0];
	if (!entity) throw new Error('Usage: mere-link context inspect <entity> [project] [--role ROLE]');
	const { config } = await loadConfig(flags);
	const context = buildContext(config, entity, rest[1], stringFlag(flags, 'role'));
	if (boolFlag(flags, 'json')) {
		writeJson(context);
	} else {
		writeText(`${context.entity.name} / ${context.project.name}`);
		printTable(surfaceRows({
			...config,
			entities: { [context.entity.key]: { ...context.entity, projects: { [context.project.key]: context.project } } }
		}, context.entity.key, context.project.key), ['role', 'integration', 'plugin', 'kind', 'id', 'optional']);
	}
	return 0;
}

async function handleSyncProjects(rest: string[], flags: ReturnType<typeof parseArgs>['flags']): Promise<number> {
	const { config } = await loadConfig(flags);
	const plan = buildProjectsSyncPlan(config, flags, rest[0], rest[1]);
	if (plan.apply) {
		const result = applyProjectsSyncPlan(plan, flags);
		if (boolFlag(flags, 'json')) writeJson({ plan, result });
		else {
			writeText(`Applied Mere Projects sync to ${plan.workspace}.`);
			printTable((result.projects as JsonRecord[] | undefined) ?? [], ['key', 'action', 'id']);
		}
	} else if (boolFlag(flags, 'json')) {
		writeJson(plan);
	} else {
		writeText(`Mere Projects sync plan for ${plan.workspace}`);
		writeText(`Policy surface: ${plan.policySurface}`);
		writeText(`Projects: ${plan.projectCount}`);
		writeText(`Links: ${plan.linkCount}`);
		writeText('Dry run only. Re-run with --apply to write project/link records.');
		printTable(plan.projects.map((project) => ({ key: project.key, title: project.title, client: project.client, action: project.action })), ['key', 'title', 'client', 'action']);
	}
	return 0;
}

function dataFlag(flags: ReturnType<typeof parseArgs>['flags']): JsonRecord {
	const raw = stringFlag(flags, 'data');
	return raw ? parseJsonRecord(raw, '--data') : {};
}

async function handleExecutorCommands(action: string | undefined, rest: string[], flags: ReturnType<typeof parseArgs>['flags']): Promise<number | null> {
	if (action === 'sources') {
		const sources = await listExecutorSources(flags);
		if (boolFlag(flags, 'json')) writeJson(sources);
		else printTable(sources, ['id', 'name', 'kind', 'url']);
		return 0;
	}
	if (action === 'tools' && rest[0] === 'search') {
		const query = rest.slice(1).join(' ');
		if (!query) throw new Error('Usage: mere-link executor tools search <query>');
		const result = await searchExecutorTools(flags, query);
		if (boolFlag(flags, 'json')) writeJson(result);
		else printTable((result.tools as JsonRecord[] | undefined) ?? [], ['id', 'pluginId', 'sourceId', 'name', 'description']);
		return 0;
	}
	if (action === 'tools' && rest[0] === 'describe') {
		const toolId = rest[1];
		if (!toolId) throw new Error('Usage: mere-link executor tools describe <tool-id>');
		const result = await describeExecutorTool(flags, toolId);
		writeJson(result);
		return 0;
	}
	if (action === 'policy' && rest[0] === 'compile') {
		const { config } = await loadConfig(flags);
		const plan = compileExecutorPolicy(config, stringFlag(flags, 'executor-scope') ?? null);
		if (boolFlag(flags, 'json')) writeJson(plan);
		else printTable(plan.rules.map((rule) => ({
			pattern: rule.pattern,
			action: rule.action,
			enforcement: rule.enforcement,
			surfaces: rule.surfaces.join(', ')
		})), ['pattern', 'action', 'enforcement', 'surfaces']);
		return 0;
	}
	if (action === 'policy' && rest[0] === 'apply') {
		if (!boolFlag(flags, 'yes')) throw new Error('Executor policy apply requires --yes after reviewing compile output.');
		const { config } = await loadConfig(flags);
		const plan = compileExecutorPolicy(config, stringFlag(flags, 'executor-scope') ?? null);
		const result = await applyExecutorPolicy(flags, config, plan);
		if (boolFlag(flags, 'json')) writeJson({ plan, result });
		else {
			const scopeId = typeof result.scopeId === 'string' ? result.scopeId : 'default';
			writeText(`Applied Executor policy to scope ${scopeId}.`);
			printTable((result.created as JsonRecord[] | undefined) ?? [], ['id', 'pattern', 'action']);
		}
		return 0;
	}
	if (action === 'invoke') {
		const mode = rest[0];
		const toolId = rest[1];
		if (mode !== 'read' && mode !== 'write') throw new Error('Usage: mere-link executor invoke read|write <tool-id> [--data JSON]');
		if (!toolId) throw new Error('Usage: mere-link executor invoke read|write <tool-id> [--data JSON]');
		const { config } = await loadConfig(flags);
		const args = dataFlag(flags);
		assertExecutorInvocationAllowed(config, mode, toolId, args, boolFlag(flags, 'apply'));
		const result = await invokeExecutorTool(flags, config, toolId, args);
		writeJson(result);
		return 0;
	}
	return null;
}

export async function main(argv: string[]): Promise<number> {
	const { positionals, flags } = parseArgs(argv);
	const [group, action, ...rest] = positionals;
	if (boolFlag(flags, 'version') || group === '--version' || group === 'version') {
		writeText(VERSION);
		return 0;
	}
	if (boolFlag(flags, 'help') || group === 'help' || !group) {
		writeText(HELP_TEXT);
		return 0;
	}
	if (group === 'commands') {
		writeJson(manifest());
		return 0;
	}
	if (group === 'completion') {
		writeText(renderCompletion(action ?? 'bash'));
		return 0;
	}
	if (group === 'config' && action === 'init') return handleConfigInit(flags);
	if (group === 'generate' && action === 'workspace') return handleGenerateWorkspace(flags);
	if (group === 'config') {
		const handled = await handleConfigRead(action, flags);
		if (handled !== null) return handled;
	}
	const listResult = await handleListCommands(group, action, rest, flags);
	if (listResult !== null) return listResult;
	if (group === 'context' && action === 'inspect') return handleContextInspect(rest, flags);
	if (group === 'sync' && action === 'projects') return handleSyncProjects(rest, flags);
	if (group === 'executor') {
		const handled = await handleExecutorCommands(action, rest, flags);
		if (handled !== null) return handled;
	}
	throw new Error('Unknown command. Run "mere-link --help".');
}

export {
	buildContext,
	compileExecutorPolicy,
	configFromWorkspaceSnapshot,
	manifest,
	normalizeConfig,
	starterConfig
};

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isDirectRun) {
	main(process.argv.slice(2)).then((code) => {
		process.exitCode = code;
	}).catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
