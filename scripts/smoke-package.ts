#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { SpawnSyncReturns } from 'node:child_process';

type PackageInfo = {
	version: string;
};

const tempRoot = mkdtempSync(path.join(tmpdir(), 'mere-link-package-'));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageInfo;

function run(command: string, args: string[]): string {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}) as SpawnSyncReturns<string>;
	if (result.status !== 0) {
		throw new Error([
			`${command} ${args.join(' ')} failed with status ${result.status}`,
			result.stderr.trim(),
			result.stdout.trim()
		].filter(Boolean).join('\n'));
	}
	return result.stdout;
}

function isCommandManifest(value: unknown): value is { app: string; commands: unknown[] } {
	return Boolean(value)
		&& typeof value === 'object'
		&& !Array.isArray(value)
		&& (value as { app?: unknown }).app === 'mere-link'
		&& Array.isArray((value as { commands?: unknown }).commands);
}

try {
	const packOutput = run('npm', ['pack', '--ignore-scripts', '--pack-destination', tempRoot]);
	const tarballName = packOutput.trim().split(/\s+/u).at(-1);
	if (!tarballName) throw new Error('npm pack did not report a tarball name.');
	const prefix = path.join(tempRoot, 'prefix');
	run('npm', ['install', '--global', '--prefix', prefix, path.join(tempRoot, tarballName)]);
	const bin = path.join(prefix, 'bin', 'mere-link');
	const version = run(bin, ['--version']).trim();
	if (version !== `mere-link ${packageJson.version}`) throw new Error(`Unexpected installed version output: ${version}`);
	const manifest = JSON.parse(run(bin, ['commands', '--json'])) as unknown;
	if (!isCommandManifest(manifest)) {
		throw new Error('Installed bin did not return a valid command manifest.');
	}
	run(bin, ['completion', 'bash']);
} finally {
	rmSync(tempRoot, { recursive: true, force: true });
}
