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

console.log('All CDK assertions passed.');
