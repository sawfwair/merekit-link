#!/usr/bin/env tsx
const [majorText] = process.versions.node.split('.');
const major = Number(majorText);

if (!Number.isInteger(major) || major < 22 || major >= 26) {
	console.error(`@merekit/link requires Node >=22 <26. Current Node is ${process.version}.`);
	console.error('Use Node 24 for release checks and publishing, for example: nvm use 24');
	process.exit(1);
}
