import { defineConfig } from 'vitepress';

function resolveBase(): string {
	const explicit = process.env.DOCS_BASE?.trim();
	if (explicit) return explicit.startsWith('/') ? explicit : `/${explicit}/`;

	const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
	if (repository) return repository.endsWith('.github.io') ? '/' : `/${repository}/`;

	return '/';
}

export default defineConfig({
	title: 'MereKit Link',
	description: 'A safe link graph and policy gate for agent-maintained work surfaces.',
	base: resolveBase(),
	cleanUrls: true,
	lastUpdated: true,
	srcExclude: ['README.md', 'SUMMARY.md'],
	head: [
		['meta', { name: 'theme-color', content: '#0f766e' }],
		['meta', { property: 'og:type', content: 'website' }],
		['meta', { property: 'og:title', content: 'MereKit Link' }],
		['meta', { property: 'og:description', content: 'Declare work surfaces, inspect project context, and gate agent writes through policy.' }]
	],
	markdown: {
		theme: {
			light: 'github-light',
			dark: 'github-dark'
		}
	},
	themeConfig: {
		siteTitle: 'MereKit Link',
		search: { provider: 'local' },
		nav: [
			{ text: 'Start', link: '/getting-started' },
			{ text: 'Concepts', link: '/concepts/link-graph' },
			{ text: 'Commands', link: '/commands/' },
			{ text: 'Reference', link: '/reference/yaml' }
		],
		sidebar: [
			{
				text: 'Orientation',
				items: [
					{ text: 'Home', link: '/' },
					{ text: 'Getting Started', link: '/getting-started' },
					{ text: 'Repository Tour', link: '/repository-tour' }
				]
			},
			{
				text: 'Concepts',
				items: [
					{ text: 'Link Graph', link: '/concepts/link-graph' },
					{ text: 'Write Policy', link: '/concepts/write-policy' },
					{ text: 'Operator Policy', link: '/concepts/operator-policy' },
					{ text: 'Executor Runtime', link: '/concepts/executor-runtime' }
				]
			},
			{
				text: 'Commands',
				items: [
					{ text: 'Command Map', link: '/commands/' },
					{ text: 'Config', link: '/commands/config' },
					{ text: 'Context', link: '/commands/context' },
					{ text: 'Policy', link: '/commands/policy' },
					{ text: 'Sync Projects', link: '/commands/sync-projects' },
					{ text: 'Executor', link: '/commands/executor' }
				]
			},
			{
				text: 'Guides',
				items: [
					{ text: 'Use With Mere CLI', link: '/guides/use-with-mere-cli' },
					{ text: 'Connect Executor', link: '/guides/connect-executor' },
					{ text: 'Publish Checklist', link: '/guides/publish-checklist' }
				]
			},
			{
				text: 'Reference',
				items: [
					{ text: 'YAML Shape', link: '/reference/yaml' },
					{ text: 'Safety Model', link: '/reference/safety-model' },
					{ text: 'Package Surface', link: '/reference/package-surface' },
					{ text: 'Operations', link: '/operations' }
				]
			}
		],
		outline: { level: [2, 3] },
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/sawfwair/merekit-link' }
		],
		editLink: {
			pattern: 'https://github.com/sawfwair/merekit-link/edit/main/docs/:path',
			text: 'Edit this page'
		},
		docFooter: {
			prev: 'Previous',
			next: 'Next'
		},
		footer: {
			message: 'Released under the Apache-2.0 License.',
			copyright: 'Copyright © MereKit Link contributors'
		}
	}
});
