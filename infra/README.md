# beeatlas infra (AWS CDK)

The AWS side of beeatlas — DNS, the beeatlas.com → beeatlas.net redirect, the two
backup buckets and the IAM users that write to them — is **all defined here as
CDK** and is the source of truth for those resources. Do not create or edit them
by hand in the console or via `aws …` one-offs: a manual change drifts and is
reverted on the next `cdk deploy`. The site itself is served by the Fly app, not
from AWS ([ADR 0042](../docs/adr/0042-beeatlas-moves-to-fly-as-one-stateful-machine.md)).

## The invariant

**Anything CDK owns, you change through CDK** — edit the stack, `cdk diff`,
`cdk deploy`. This most often bites on **Route 53**: the apex / `www` / `api`
records are `NetA*` / `NetAAAA*` / `ApiA` / `ApiAAAA` in [`lib/beeatlas-stack.ts`](lib/beeatlas-stack.ts).
A hand-run `aws route53 change-resource-record-sets` is the wrong tool.

Never `cdk destroy` and never touch, in a way that could replace them, the
redirect CloudFront distribution, the `AuthoritativeBackupBucket` or the
`PipelineBackupBucket` — the buckets hold the only offsite copies of production
state. Additive, surgical edits (a new record, a new behavior) are fine; the
`api.beeatlas.net` record was added exactly that way.

## Stacks

Two stacks (`bin/infra.ts`), account from `CDK_DEFAULT_ACCOUNT`:

- **GlobalStack** (`us-east-1` — ACM for CloudFront must live there):
  [`lib/global-stack.ts`](lib/global-stack.ts) — the `beeatlas.net` /
  `beeatlas.com` hosted zones and their DNS-validated certs.
- **BeeAtlasStack** (`us-west-2`): [`lib/beeatlas-stack.ts`](lib/beeatlas-stack.ts)
  — all the Route 53 records (beeatlas.net, www and api point at the Fly app), the
  beeatlas.com redirect distribution, the pipeline IAM user, the notes-replica IAM
  user, and the two backup buckets.

## Deploying

Local, from this directory. Uses your **default AWS identity** (the `rainhead`
profile / SSO session) — **not** the pipeline's `beeatlas-pipeline` key, which is
the nightly's data-plane identity for S3 backups and is wrong for CDK.

```sh
pnpm run diff      # cdk diff --all   — always review first
pnpm run deploy    # cdk deploy --all — or: pnpm exec cdk deploy BeeAtlasStack
```

Application deploys (the site itself) do **not** go through this stack — the
Fly Machine's nightly builds and merge-swaps the site into the root Caddy serves
(`data/nightly.sh`), and every push to `main` deploys the image (the Fly deploy
workflow). CDK is for the infrastructure, not the content.

### Toolchain

TypeScript compiles to `dist/` and CDK runs the compiled JavaScript —
`cdk.json`'s app command is `pnpm run --silent build && node dist/bin/infra.js`,
so every `cdk` invocation rebuilds first and can never synth stale output. There
is no TypeScript-at-runtime loader; `ts-node` was dropped in beeatlas-fa7
because TypeScript 7 (the native port) no longer exposes the JS API surface it
read. `pnpm test` compiles the same way.

The old `TS_NODE_TRANSPILE_ONLY=1` workaround documented here is gone with it —
`tsconfig.json` carries `"types": ["node"]` and the type-check passes clean.

## Where the site has been served from

- **Until 2026-07:** S3 + CloudFront, defined here. Deleted in the st-vjd teardown.
- **2026-07 to 2026-10-23:** maderas, a Linode, through Apache
  ([stelis ADR 0007](https://github.com/rainhead/stelis); the retired
  [serve-from-maderas runbook](../docs/runbooks/serve-from-maderas.md)).
- **Since 2026-10-23:** the beeatlas Fly app
  ([cutover runbook](../docs/runbooks/fly-cutover.md)). Rolling back would mean
  standing maderas's BeeAtlas side up again; it was taken down on 2026-10-24.
