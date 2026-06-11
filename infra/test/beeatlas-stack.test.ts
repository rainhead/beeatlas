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

// Assert: /app/sw.js behavior exists in CacheBehaviors
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({ PathPattern: '/app/sw.js' }),
    ]),
  },
});

// Assert: /app/manifest.webmanifest behavior exists in CacheBehaviors
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({ PathPattern: '/app/manifest.webmanifest' }),
    ]),
  },
});

// Assert: a ResponseHeadersPolicy with Cache-Control: no-cache header exists
template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
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
});

// Assert: a zero-TTL CachePolicy exists (DefaultTTL=0, MaxTTL=0)
template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
  CachePolicyConfig: {
    DefaultTTL: 0,
    MaxTTL: 0,
  },
});

console.log('All CDK assertions passed.');
