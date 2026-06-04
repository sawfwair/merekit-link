import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'docs/.vitepress/cache/**', 'docs/.vitepress/dist/**', 'docs-worker/**', 'eslint.config.js']
	},
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				project: ['./tsconfig.json', './tsconfig.test.json'],
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
			'@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			'@typescript-eslint/no-unnecessary-type-parameters': 'off',
			'@typescript-eslint/restrict-template-expressions': ['error', {
				allowBoolean: true,
				allowNullish: true,
				allowNumber: true
			}]
		}
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			'no-restricted-imports': ['error', {
				paths: [
					{
						name: 'node:child_process',
						importNames: ['spawnSync'],
						message: 'Use src/runtime/mere.ts so subprocess JSON/error handling stays typed and testable.'
					},
					{
						name: 'yaml',
						message: 'Use src/runtime/yaml.ts so YAML parsing errors stay normalized.'
					}
				]
			}],
			'no-restricted-properties': ['error', {
				object: 'JSON',
				property: 'parse',
				message: 'Use src/runtime/json.ts so external JSON is parsed at typed boundaries.'
			}]
		}
	},
	{
		files: ['src/runtime/json.ts', 'src/runtime/mere.ts', 'src/runtime/yaml.ts'],
		rules: {
			'no-restricted-imports': 'off',
			'no-restricted-properties': 'off'
		}
	},
	{
		files: ['test/**/*.ts'],
		rules: {
			'@typescript-eslint/no-floating-promises': 'off'
		}
	}
);
