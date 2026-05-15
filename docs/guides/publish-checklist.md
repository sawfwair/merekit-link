# Publish Checklist

Use this before making the repository public or publishing a package.

## Verify

```sh
nvm use 24
pnpm release:check
```

The release gate includes:

- lint with zero warnings
- source and test typecheck
- test suite
- coverage thresholds
- CLI smoke
- installed package smoke
- VitePress docs build
- npm package dry run
- npm audit at low severity and above

## Scan

```sh
gitleaks detect --source . --redact --no-banner
gitleaks dir . --redact --no-banner
pnpm audit --prod
```

## Inspect Package Contents

```sh
npm pack --dry-run --ignore-scripts --json
```

Check that the tarball contains docs, `dist`, package metadata, and license files. It should not contain local caches, test output, databases, keys, archives, or vendored dependency trees.

## Public Metadata

Confirm:

- `private` is `false`
- `license` is `Apache-2.0`
- package `repository`, `bugs`, and `homepage` point at the intended public repo
- `README.md`, `SECURITY.md`, and `CONTRIBUTING.md` are included in package contents
- Executor is documented as a separate runtime dependency, not a bundled dependency
- if Link command shapes changed, the `@merekit/cli` bundled adapter was regenerated and `pnpm check:adapters` passed in `~/mere/mere-cli-public`

## Public Repo Settings

- Enable GitHub secret scanning and push protection.
- Enable private vulnerability reporting.
- Protect `main` from force pushes.
- Require the CI workflow before merge.
- Enable Dependabot for npm and GitHub Actions.
- Set the Pages source to GitHub Actions and confirm the Docs workflow deploys to `https://sawfwair.github.io/merekit-link/`.
- Configure npm Trusted Publishing for `@merekit/link`:
  - Provider: GitHub Actions.
  - Repository: `sawfwair/merekit-link`.
  - Workflow filename: `publish.yml`.
  - Environment name: `npm`.

## Publish

- Confirm `package.json` contains a version newer than npm.
- Confirm the dry-run tarball contains only intended files.
- Merge the release PR to `main`; the `Publish` workflow runs automatically when `package.json` is newer than the registry version.
- Use the manual `Publish` workflow for an intentional rerun or non-`latest` dist-tag.
- Confirm the workflow created the matching GitHub Release after npm publish succeeds.
