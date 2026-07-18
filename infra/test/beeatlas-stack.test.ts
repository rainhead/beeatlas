// CDK template assertion test for Phase 147 (ROUTE-03).
// Run: cd infra && npx ts-node test/beeatlas-stack.test.ts
// Asserts: two no-cache CloudFront behaviors (/app/sw.js, /app/manifest.webmanifest)
// with Cache-Control: no-cache, no-store, must-revalidate response header and a
// zero-TTL CachePolicy.

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

// Resolve the zero-TTL CachePolicy logical ID (DefaultTTL=0, MaxTTL=0).
// D-09 mandates a single SHARED no-cache policy, so we assert exactly one
// exists and then prove both /app behaviors reference it by Ref (WR-01).
const zeroTtlCachePolicies = template.findResources('AWS::CloudFront::CachePolicy', {
  Properties: { CachePolicyConfig: { DefaultTTL: 0, MaxTTL: 0 } },
});
const cachePolicyIds = Object.keys(zeroTtlCachePolicies);
assert.equal(
  cachePolicyIds.length,
  1,
  `expected exactly one zero-TTL CachePolicy (D-09 shared policy), found ${cachePolicyIds.length}`,
);
const zeroTtlCachePolicyId = cachePolicyIds[0];

// Resolve the no-cache ResponseHeadersPolicy logical ID (Cache-Control override).
const noCacheHeaderPolicies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy', {
  Properties: {
    ResponseHeadersPolicyConfig: {
      CustomHeadersConfig: {
        Items: Match.arrayWith([
          Match.objectLike({
            Header: 'Cache-Control',
            Value: Match.stringLikeRegexp('no-cache'),
            Override: true,
          }),
        ]),
      },
    },
  },
});
const headerPolicyIds = Object.keys(noCacheHeaderPolicies);
assert.equal(
  headerPolicyIds.length,
  1,
  `expected exactly one no-cache ResponseHeadersPolicy (D-09 shared policy), found ${headerPolicyIds.length}`,
);
const noCacheHeaderPolicyId = headerPolicyIds[0];

// Assert: each /app behavior exists AND actually references the no-cache
// CachePolicy + ResponseHeadersPolicy by Ref. Decoupled existence checks would
// pass even if a regression swapped these behaviors onto CACHING_OPTIMIZED.
for (const pathPattern of ['/app/sw.js', '/app/manifest.webmanifest']) {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({
          PathPattern: pathPattern,
          CachePolicyId: { Ref: zeroTtlCachePolicyId },
          ResponseHeadersPolicyId: { Ref: noCacheHeaderPolicyId },
        }),
      ]),
    },
  });
}

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
//    DeletionPolicy=Retain (the siteBucket uses DeletionPolicy=Delete); both
//    get the SAME boundary assertions below.
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

  // 3. Deployer role (beeatlas-github-deployer) must have ZERO references to the
  //    backup bucket in any attached IAM policy — structural STORE-04 boundary.
  const deployerRoleEntries = Object.entries(cfResources).filter(([, r]: [string, any]) =>
    r.Type === 'AWS::IAM::Role' &&
    r.Properties?.RoleName === 'beeatlas-github-deployer',
  ) as [string, any][];
  assert.equal(deployerRoleEntries.length, 1, 'Expected exactly one beeatlas-github-deployer role');
  const deployerRoleId = deployerRoleEntries[0][0];

  const deployerPolicyEntries = Object.entries(cfResources).filter(([, r]: [string, any]) => {
    if (r.Type !== 'AWS::IAM::Policy') return false;
    const roles: any[] = r.Properties?.Roles ?? [];
    return roles.some((ref: any) => ref?.Ref === deployerRoleId);
  }) as [string, any][];

  for (const [policyLogicalId, policy] of deployerPolicyEntries) {
    const policyStr = JSON.stringify(policy);
    assert.ok(
      !policyStr.includes(backupBucketId),
      `Deployer role policy ${policyLogicalId} must NOT reference backup bucket ` +
      `${backupBucketId} — STORE-04 boundary violated`,
    );
  }

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

console.log('All CDK assertions passed.');
