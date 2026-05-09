import type { JsonRecord } from './types.js';

function scalarText(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	return '';
}

export function normalizeKey(value: unknown): string {
	return scalarText(value)
		.trim()
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asRecord(value: unknown, label: string): JsonRecord {
	if (!isRecord(value)) throw new Error(`${label} must be an object.`);
	return value;
}

export function asArray(value: unknown, label: string): unknown[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

export function stringArray(value: unknown, label: string): string[] {
	return [...new Set(asArray(value, label).map((item) => String(item).trim()).filter(Boolean).map(normalizeKey))];
}

export function readOptionalString(record: JsonRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readRequiredString(record: JsonRecord, key: string, label: string): string {
	const value = record[key];
	const text = scalarText(value).trim();
	if (!text) throw new Error(`${label}.${key} is required.`);
	return text;
}
