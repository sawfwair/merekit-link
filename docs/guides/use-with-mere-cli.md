# Use With Mere CLI

Link has two public entrypoints:

- `mere-link`, from the standalone `@merekit/link` package.
- `mere link ...`, from the public `@merekit/cli` command plane.

They are separate packages because they serve different install shapes. Use `@merekit/link` when you only need the YAML graph, safety policy, and optional Executor bridge. Use `@merekit/cli` when you already want the root `mere` command, app discovery, agent context packs, MCP support, and bundled app adapters.

## Same Commands

The standalone command:

```sh
mere-link config init --output mere.link.yaml
mere-link config validate --config mere.link.yaml --json
mere-link executor policy compile --config mere.link.yaml --json
```

The bundled command-plane form:

```sh
mere link config init --output mere.link.yaml
mere link config validate --config mere.link.yaml --json
mere link executor policy compile --config mere.link.yaml --json
```

The root CLI does not reimplement Link. It resolves a Link adapter, reads the Link command manifest, passes through only supported flags, and delegates execution to the Link runtime.

## Why The Packages Stay Separate

`@merekit/link` stays small and usable without hosted Mere services. It can validate local configs, inspect project context, compile policy, and talk to an Executor-compatible HTTP runtime without installing the broader command plane.

`@merekit/cli` bundles Link for convenience. A global `mere` install can list apps with `mere apps list`, discover Link commands with `mere apps manifest --app link --json`, and run the same behavior through `mere link ...`.

## Maintainer Sync

When Link command shapes change, regenerate the bundled adapter in `@merekit/cli` from a sibling checkout:

```sh
cd ~/mere/mere-cli-public
pnpm build:adapters
pnpm check:adapters
```

The bundled adapter is generated output. The source package for Link behavior remains this repository.
