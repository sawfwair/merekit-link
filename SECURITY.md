# Security

MereKit Link is designed to be inspectable and dry-run first. Write-capable flows should require explicit Link policy and an apply flag.

## Reporting

Please do not post exploit details in a public issue. Use GitHub private vulnerability reporting when it is available for the repository, or open a minimal issue asking for a private maintainer contact path.

## Supported Versions

Security fixes target the latest released version of `@merekit/link` and the current `main` branch.

## Maintainer Checklist

- Run `pnpm verify`.
- Run a secret scan before making the repository public.
- Review package contents with `npm pack --dry-run --ignore-scripts`.
- Re-check write paths when changing `sync projects`, Executor policy compilation, or `executor invoke`.
