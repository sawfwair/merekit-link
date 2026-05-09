import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { DEFAULT_CONFIG } from '../manifest.js';
import { boolFlag, stringFlag } from '../runtime/args.js';
import { fileExists, isNodeError, resolvePath } from '../runtime/paths.js';
import { parseYaml, stringifyYaml } from '../runtime/yaml.js';
import { normalizeConfig } from './normalize.js';
import type { Flags, LinkConfigFile, LoadedConfig } from '../domain/types.js';

export function configPath(flags: Flags): string {
	return resolvePath(stringFlag(flags, 'config') ?? process.env.MERE_LINK_CONFIG ?? DEFAULT_CONFIG);
}

export async function loadConfig(flags: Flags): Promise<LoadedConfig> {
	const filePath = configPath(flags);
	let raw: string;
	try {
		raw = await readFile(filePath, 'utf8');
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') throw new Error(`Config not found: ${filePath}. Run "mere-link config init --output ${DEFAULT_CONFIG}".`, { cause: error });
		throw error;
	}
	const parsed = parseYaml(raw, filePath);
	return { path: filePath, config: normalizeConfig(parsed, filePath) };
}

export async function writeConfigOutput(config: LinkConfigFile, flags: Flags): Promise<{ yaml: string; path: string | null; wrote: boolean }> {
	const output = stringFlag(flags, 'output');
	const yaml = stringifyYaml(config);
	if (!output) return { yaml, path: null, wrote: false };
	const filePath = resolvePath(output);
	if (await fileExists(filePath) && !boolFlag(flags, 'yes')) {
		throw new Error(`Refusing to overwrite ${filePath}. Pass --yes to replace it.`);
	}
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, yaml, 'utf8');
	return { yaml, path: filePath, wrote: true };
}
