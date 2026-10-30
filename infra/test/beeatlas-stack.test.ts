// CDK template assertion test.
// Run: cd infra && npm test   (compiles to dist/, then runs node on the output)
// Asserts the post-st-vjd stack shape: the serving infra (site bucket, site
// distribution, GitHub OIDC deployer) is GONE and stays gone; the beeatlas.com
// redirect distribution survives; and the two backup buckets keep their
// Phase 177 STORE-04 boundary (versioned + RETAIN + 180-day lifecycle,
// pipeline user limited to Put/Get/List — no delete).

import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { GlobalStack } from '../lib/global-stack';
import { BeeAtlasStack } from '../lib/beeatlas-stack';

const app = new cdk.App({
  context: {
    '@aws-cdk/core:bootstrapQualifier': 'beeatlas',
    '@aws-cdk/core:stackRelativeExports': 'true',
  },
});

// GlobalStack must be instantiated first (us-east-1, where ACM certs live).
// Explicit fake account/region prevents CDK token resolution issues (Pitfall 4).
const globalStack = new GlobalStack(app, 'G', {
  env: { account: '123456789012', region: 'us-east-1' },
  crossRegionReferences: true,
});

const stack = new BeeAtlasStack(app, 'S', {
  env: { account: '123456789012', region: 'us-west-2' },
  crossRegionReferences: true,
  global: globalStack,
});

const template = Template.fromStack(stack);

// ── st-vjd teardown locks ─────────────────────────────────────────────────
// The serving infra must not creep back in: the Fly app serves the site
// (ADR 0042). Exactly ONE distribution remains — the beeatlas.com →
// beeatlas.net redirect — and it must not have an S3 origin (its HttpOrigin
// is never contacted; the viewer-request function 301s first).
template.resourceCountIs('AWS::CloudFront::Distribution', 1);
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    Aliases: Match.arrayWith(['beeatlas.com', 'www.beeatlas.com']),
  },
});
const distributions = template.findResources('AWS::CloudFront::Distribution');
for (const [distId, dist] of Object.entries(distributions) as [string, any][]) {
  const originsStr = JSON.stringify(dist.Properties?.DistributionConfig?.Origins ?? []);
  assert.ok(
    !originsStr.includes('S3Origin') && !originsStr.includes('RegionalDomainName'),
    `${distId} must not have an S3 origin — the site bucket is retired (st-vjd)`,
  );
}

// No GitHub OIDC deployer infra of any kind. (A blanket role count won't do —
// the cross-region redirectCert import owns a custom-resource role.)
template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
const allRoles = template.findResources('AWS::IAM::Role');
for (const [roleId, role] of Object.entries(allRoles) as [string, any][]) {
  const roleStr = JSON.stringify(role);
  assert.ok(
    !roleStr.includes('token.actions.githubusercontent.com') &&
    role.Properties?.RoleName !== 'beeatlas-github-deployer',
    `${roleId} looks like GitHub OIDC deploy infra — retired by st-vjd`,
  );
}

// Exactly the two backup buckets — the site bucket must not come back.
template.resourceCountIs('AWS::S3::Bucket', 2);

// ── Phase 177 STORE-04 assertions ─────────────────────────────────────────
// Synth-time boundary lock: proves the CDK template enforces the IAM isolation
// between the GitHub OIDC deployer role and the AuthoritativeBackupBucket, and
// that the pipeline user has only the expected limited grants on it.

const cfTemplate = template.toJSON();
const cfResources = cfTemplate.Resources as Record<string, any>;

// 1. Find the two backup buckets: versioned + RETAIN + 180-day lifecycle.
//    AuthoritativeBackupBucket (notes store, Phase 177) and
//    PipelineBackupBucket (duckdb + taxa, Model Y st-pry). Exactly these two
//    buckets have VersioningConfiguration.Status=Enabled and
//    DeletionPolicy=Retain; both get the SAME boundary assertions below.
const backupBucketEntries = Object.entries(cfResources).filter(([, r]: [string, any]) =>
  r.Type === 'AWS::S3::Bucket' &&
  r.Properties?.VersioningConfiguration?.Status === 'Enabled' &&
  r.DeletionPolicy === 'Retain',
) as [string, any][];
assert.equal(
  backupBucketEntries.length,
  2,
  `Expected exactly two versioned+RETAIN S3 buckets (Authoritative + Pipeline), found ${backupBucketEntries.length}`,
);
for (const expectedPrefix of ['AuthoritativeBackupBucket', 'PipelineBackupBucket']) {
  assert.equal(
    backupBucketEntries.filter(([id]) => id.startsWith(expectedPrefix)).length,
    1,
    `Expected exactly one bucket with logical-ID prefix ${expectedPrefix}`,
  );
}

for (const [backupBucketId, backupBucketCf] of backupBucketEntries) {
  assert.equal(
    backupBucketCf.UpdateReplacePolicy,
    'Retain',
    `${backupBucketId} must have UpdateReplacePolicy: Retain`,
  );

  // 2. Assert 180-day object expiration AND 180-day noncurrent-version expiration.
  const lifecycleRules: any[] = backupBucketCf.Properties?.LifecycleConfiguration?.Rules ?? [];
  const has180DayLifecycle = lifecycleRules.some((r: any) =>
    r.ExpirationInDays === 180 &&
    r.NoncurrentVersionExpiration?.NoncurrentDays === 180 &&
    r.Status === 'Enabled',
  );
  assert.ok(
    has180DayLifecycle,
    `${backupBucketId} must have a lifecycle rule: ExpirationInDays=180 ` +
    'and NoncurrentVersionExpiration.NoncurrentDays=180',
  );

  // 3. (Deployer role STORE-04 checks retired with the role itself — the
  //    absence locks above are the stronger guarantee.)

  // 4. Pipeline user (beeatlas-pipeline) policy assertions on the backup bucket.
  const pipelineUserEntries = Object.entries(cfResources).filter(([, r]: [string, any]) =>
    r.Type === 'AWS::IAM::User' &&
    r.Properties?.UserName === 'beeatlas-pipeline',
  ) as [string, any][];
  assert.equal(pipelineUserEntries.length, 1, 'Expected exactly one beeatlas-pipeline user');
  const pipelineUserId = pipelineUserEntries[0][0];

  // Gather all statements from all IAM policies attached to the pipeline user.
  const pipelinePolicyStatements: any[] = (Object.values(cfResources) as any[])
    .filter((r: any) => {
      if (r.Type !== 'AWS::IAM::Policy') return false;
      const users: any[] = r.Properties?.Users ?? [];
      return users.some((ref: any) => ref?.Ref === pipelineUserId);
    })
    .flatMap((r: any) => r.Properties?.PolicyDocument?.Statement ?? []);

  // 4a. Must have s3:PutObject + s3:GetObject on backup bucket arnForObjects('*').
  //     CDK renders arnForObjects('*') as {"Fn::Join":["",["<bucket-arn>","/*"]]}.
  const hasPutGetOnBackup = pipelinePolicyStatements.some((stmt: any) => {
    const actions: string[] = [stmt.Action].flat();
    const resources: any[] = [stmt.Resource].flat();
    return (
      actions.includes('s3:PutObject') &&
      actions.includes('s3:GetObject') &&
      resources.some((r: any) => {
        const s = JSON.stringify(r);
        return s.includes(backupBucketId) && s.includes('/*');
      })
    );
  });
  assert.ok(
    hasPutGetOnBackup,
    'Pipeline user must have s3:PutObject + s3:GetObject on backup bucket arnForObjects("*")',
  );

  // 4b. Must have s3:ListBucket on backup bucket ARN (bucket-level, no /* suffix).
  //     CDK renders bucketArn as {"Fn::GetAtt":["<logical-id>","Arn"]} (no /* suffix).
  const hasListBucketOnBackup = pipelinePolicyStatements.some((stmt: any) => {
    const actions: string[] = [stmt.Action].flat();
    const resources: any[] = [stmt.Resource].flat();
    return (
      actions.includes('s3:ListBucket') &&
      resources.some((r: any) => {
        const s = JSON.stringify(r);
        return s.includes(backupBucketId) && !s.includes('/*');
      })
    );
  });
  assert.ok(
    hasListBucketOnBackup,
    'Pipeline user must have s3:ListBucket on backup bucket bucket ARN (not arnForObjects)',
  );

  // 4c. Must NOT have s3:DeleteObject on backup bucket — negative regression lock.
  //     S3 Versioning is the recovery layer; DeleteObject by the pipeline would
  //     bypass it by creating a delete marker.
  const hasDeleteObjectOnBackup = pipelinePolicyStatements.some((stmt: any) => {
    const actions: string[] = [stmt.Action].flat();
    const resources: any[] = [stmt.Resource].flat();
    return (
      actions.some((a: string) => a === 's3:DeleteObject' || a === 's3:*') &&
      resources.some((r: any) => JSON.stringify(r).includes(backupBucketId))
    );
  });
  assert.ok(
    !hasDeleteObjectOnBackup,
    `Pipeline user must NOT have s3:DeleteObject (or s3:*) on ${backupBucketId} — STORE-04 boundary violated`,
  );
} // end per-backup-bucket assertions

// ── ADR 0046: Hostess's pipeline user ──────────────────────────────────────
// The nightly on Hostess backs up to the pipeline bucket and must reach nothing
// else: the authoritative bucket holds the notes store, which Hostess never holds.
// No delete, as for beeatlas-pipeline.
{
  const hostessUsers = Object.entries(cfResources).filter(([, r]: [string, any]) =>
    r.Type === 'AWS::IAM::User' && r.Properties?.UserName === 'beeatlas-hostess-pipeline',
  );
  assert.equal(hostessUsers.length, 1, 'Expected exactly one beeatlas-hostess-pipeline user');
  const hostessUserId = hostessUsers[0][0];
  const statements: any[] = Object.values(cfResources)
    .filter((r: any) => r.Type === 'AWS::IAM::Policy' &&
      (r.Properties?.Users ?? []).some((u: any) => u?.Ref === hostessUserId))
    .flatMap((r: any) => r.Properties.PolicyDocument.Statement);
  assert.ok(statements.length > 0, 'the Hostess pipeline user needs its grants');
  for (const st of statements) {
    const actions: string[] = [].concat(st.Action);
    for (const res of [].concat(st.Resource).map((x: any) => JSON.stringify(x))) {
      assert.ok(res.includes('PipelineBackupBucket'),
        `the Hostess pipeline user reaches beyond the pipeline bucket: ${res}`);
    }
    assert.ok(!actions.some((a) => a === 's3:DeleteObject' || a === 's3:*'),
      'the Hostess pipeline user must not delete: versioning is the recovery layer');
  }
}

// ── beeatlas-lwqi: the notes replica's user ────────────────────────────────
// Litestream must delete (it retires WAL segments and snapshots), which the pipeline
// user above may not. Its own user may, under replica/ in the authoritative bucket and
// nowhere else, and may list only that prefix.
{
  const replicaUsers = Object.entries(cfResources).filter(([, r]: [string, any]) =>
    r.Type === 'AWS::IAM::User' && r.Properties?.UserName === 'beeatlas-notes-replica',
  );
  assert.equal(replicaUsers.length, 1, 'Expected exactly one beeatlas-notes-replica user');
  const replicaUserId = replicaUsers[0][0];
  const statements: any[] = Object.values(cfResources)
    .filter((r: any) => r.Type === 'AWS::IAM::Policy' &&
      (r.Properties?.Users ?? []).some((u: any) => u?.Ref === replicaUserId))
    .flatMap((r: any) => r.Properties.PolicyDocument.Statement);
  const actionsOf = (st: any): string[] => [].concat(st.Action);
  const resourcesOf = (st: any): string[] => [].concat(st.Resource).map((x: any) => JSON.stringify(x));

  const deleting = statements.filter((st) => actionsOf(st).some((a) => a === 's3:DeleteObject' || a === 's3:*'));
  assert.ok(deleting.length > 0, 'the replica user must be able to delete under replica/');
  for (const st of deleting) {
    for (const res of resourcesOf(st)) {
      assert.ok(res.includes('/replica/*'), `replica user deletes outside replica/: ${res}`);
      assert.ok(res.includes('AuthoritativeBackupBucket'), `replica user deletes outside the authoritative bucket: ${res}`);
    }
  }
  // The replica must never be expired while current: an idle store gets no new
  // snapshot, and its last one would vanish under the backups' 180-day expiry.
  const authoritative = backupBucketEntries.find(([id]) => id.startsWith('AuthoritativeBackupBucket'))![1];
  const rules: any[] = authoritative.Properties.LifecycleConfiguration.Rules;
  for (const r of rules.filter((r) => r.ExpirationInDays !== undefined)) {
    assert.equal(r.Prefix, 'backups/', 'current-object expiry must be scoped to backups/, never the replica');
  }
  assert.ok(rules.some((r) => r.Prefix === 'replica/' && r.ExpirationInDays === undefined),
    'the replica/ prefix needs its own rule, with no current-object expiry');

  // Likewise the basemap archives in the pipeline bucket (beeatlas-g3xy): replaced
  // quarterly at best, so no current-object expiry may cover basemap/.
  const pipeline = backupBucketEntries.find(([id]) => id.startsWith('PipelineBackupBucket'))![1];
  const pipelineRules: any[] = pipeline.Properties.LifecycleConfiguration.Rules;
  for (const r of pipelineRules.filter((r) => r.ExpirationInDays !== undefined)) {
    assert.ok(['db/', 'raw/', 'stelis/'].includes(r.Prefix),
      `pipeline bucket expiry must be scoped to db/, raw/ or stelis/, never the basemap (got ${r.Prefix})`);
  }
  assert.ok(pipelineRules.some((r) => r.Prefix === 'basemap/' && r.ExpirationInDays === undefined),
    'the basemap/ prefix needs its own rule, with no current-object expiry');

  const listing = statements.filter((st) => actionsOf(st).includes('s3:ListBucket'));
  assert.equal(listing.length, 1, 'the replica user lists one bucket');
  assert.deepEqual(listing[0].Condition?.StringLike?.['s3:prefix'], ['replica/*', 'replica'],
    'the replica user may list only the replica/ prefix');
}

console.log('All CDK assertions passed.');
