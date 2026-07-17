# beeatlas infra (AWS CDK)

The AWS side of beeatlas — DNS, TLS, the S3 site bucket, the CloudFront
distributions, the authoritative-store backup bucket, and the CI deploy
identity — is **all defined here as CDK** and is the source of truth for those
resources. Do not create or edit them by hand in the console or via `aws …`
one-offs: a manual change drifts and is reverted on the next `cdk deploy`.

## The invariant

**Anything CDK owns, you change through CDK** — edit the stack, `cdk diff`,
`cdk deploy`. This most often bites on **Route 53**: the apex / `www` / `api`
records are `NetA*` / `NetAAAA*` / `ApiA` in [`lib/beeatlas-stack.ts`](lib/beeatlas-stack.ts).
A hand-run `aws route53 change-resource-record-sets` is the wrong tool.

Never `cdk destroy` and never touch, in a way that could replace them, the
`SiteBucket`, either CloudFront distribution, the `GitHubDeployerRole`, or the
`AuthoritativeBackupBucket` — they hold or serve production state. Additive,
surgical edits (a new record, a new behavior) are fine; the `api.beeatlas.net`
record was added exactly that way.

## Stacks

Two stacks (`bin/infra.ts`), account from `CDK_DEFAULT_ACCOUNT`:

- **GlobalStack** (`us-east-1` — ACM for CloudFront must live there):
  [`lib/global-stack.ts`](lib/global-stack.ts) — the `beeatlas.net` /
  `beeatlas.com` hosted zones and their DNS-validated certs.
- **BeeAtlasStack** (`us-west-2`): [`lib/beeatlas-stack.ts`](lib/beeatlas-stack.ts)
  — the `SiteBucket`, the main + redirect CloudFront distributions, all the
  Route 53 records, the GitHub-OIDC deployer role + pipeline IAM user, and the
  `AuthoritativeBackupBucket`.

## Deploying

Local, from this directory. Uses your **default AWS identity** (the `rainhead`
profile / SSO session) — **not** `--profile beeatlas`, which is `nightly.sh`'s
maderas data-plane profile for S3 pull/push and is wrong for CDK.

```sh
npm run diff      # cdk diff --all   — always review first
npm run deploy    # cdk deploy --all — or: npx cdk deploy BeeAtlasStack
```

Application deploys (the site itself) do **not** go through this stack — CI
builds and syncs to S3 via the GitHub-OIDC `GitHubDeployerRole` (see
`.github/workflows/deploy.yml`). CDK is for the infrastructure, not the content.

### Known quirk

This checkout currently trips `tsc` / `ts-node` on `@types/node` resolution
(`Cannot find name 'process'` etc. — `tsconfig` omits `node` from `types`), so
`cdk` commands fail their type-check. Until that's fixed, prefix with
`TS_NODE_TRANSPILE_ONLY=1`:

```sh
TS_NODE_TRANSPILE_ONLY=1 npx cdk diff BeeAtlasStack
```

## Serving move (ADR 0007)

`beeatlas.net` + `www` now resolve to **maderas** (dual-stack `NetA*`/`NetAAAA*`
→ `45.79.96.48` / the Linode IPv6), which serves the rendered site via Apache —
see [stelis ADR 0007](https://github.com/rainhead/stelis) and the
[serve-from-maderas runbook](../docs/runbooks/serve-from-maderas.md). The
CloudFront distribution + `SiteBucket` stay defined here, warm, as the rollback
path: revert the record targets to the CloudFront alias and redeploy.
