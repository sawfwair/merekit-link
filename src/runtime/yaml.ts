import YAML from 'yaml';

export function parseYaml(raw: string, label: string): unknown {
	try {
		return YAML.parse(raw) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`${label} must be valid YAML: ${detail}`, { cause: error });
	}
}

export function stringifyYaml(value: unknown): string {
	return YAML.stringify(value);
}
