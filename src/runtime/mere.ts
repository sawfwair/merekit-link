import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { asArray, isRecord } from '../domain/guards.js';
import type { Flags, JsonRecord, MereProjectRecord, WorkspaceSnapshot } from '../domain/types.js';
import { normalizeWorkspaceSnapshot } from '../config/starter.js';
import { stringFlag } from './args.js';
import { parseJson } from './json.js';
import { resolvePath } from './paths.js';

export function mereBin(flags: Flags): string {
	return stringFlag(flags, 'mere-bin') ?? process.env.MERE_BIN?.trim() ?? 'mere';
}

function runMereJson(flags: Flags, args: string[], data?: JsonRecord): unknown {
	const finalArgs = [...args, '--json'];
	if (data) finalArgs.push('--data', JSON.stringify(data));
	const result = spawnSync(mereBin(flags), finalArgs, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		env: process.env
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `mere ${finalArgs.join(' ')} exited ${result.status}`);
	}
	return parseJson(result.stdout, `mere ${finalArgs.join(' ')}`);
}

export async function readSnapshot(flags: Flags): Promise<WorkspaceSnapshot> {
	const filePath = stringFlag(flags, 'snapshot-file');
	if (filePath) {
		return normalizeWorkspaceSnapshot(parseJson(await readFile(resolvePath(filePath), 'utf8'), filePath));
	}
	const workspace = stringFlag(flags, 'workspace');
	if (!workspace) throw new Error('Usage: mere-link generate workspace --workspace ID [--output FILE]');
	const result = spawnSync(mereBin(flags), ['ops', 'workspace-snapshot', '--workspace', workspace, '--json'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(result.stderr || result.stdout || `mere ops workspace-snapshot exited ${result.status}`);
	return normalizeWorkspaceSnapshot(parseJson(result.stdout, 'mere ops workspace-snapshot'));
}

export function listMereProjects(flags: Flags, workspace: string): MereProjectRecord[] {
	return asArray(runMereJson(flags, ['projects', 'project', 'list', '--workspace', workspace]), 'Mere Projects project list')
		.filter(isRecord) as MereProjectRecord[];
}

export function writeMereProject(flags: Flags, workspace: string, payload: JsonRecord, existingId: string | undefined): JsonRecord {
	const result = existingId
		? runMereJson(flags, ['projects', 'project', 'update', existingId, '--workspace', workspace], payload)
		: runMereJson(flags, ['projects', 'project', 'create', '--workspace', workspace], payload);
	if (!isRecord(result)) throw new Error('Mere Projects did not return an object.');
	return result;
}

export function upsertMereLink(flags: Flags, workspace: string, projectId: string, payload: JsonRecord): JsonRecord {
	const result = runMereJson(flags, ['projects', 'link', 'upsert', '--workspace', workspace, '--project', projectId], payload);
	if (!isRecord(result)) throw new Error('Mere Projects link upsert did not return an object.');
	return result;
}
