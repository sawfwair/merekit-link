import { asArray, asRecord } from '../domain/guards.js';
import type { JsonRecord } from '../domain/types.js';

export function parseJson(raw: string, label: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`${label} must be valid JSON: ${detail}`, { cause: error });
	}
}

export function parseJsonRecord(raw: string, label: string): JsonRecord {
	return asRecord(parseJson(raw, label), label);
}

export function parseJsonArray(raw: string, label: string): unknown[] {
	return asArray(parseJson(raw, label), label);
}
