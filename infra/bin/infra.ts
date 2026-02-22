#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GlobalStack } from '../lib/global-stack';
import { BeeAtlasStack } from '../lib/beeatlas-stack';

const app = new cdk.App();

// ACM certificates for CloudFront must be in us-east-1.
// crossRegionReferences allows CDK to pass constructs between stacks in different regions.
const globalStack = new GlobalStack(app, 'GlobalStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  crossRegionReferences: true,
});

new BeeAtlasStack(app, 'BeeAtlasStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
  },
  crossRegionReferences: true,
  global: globalStack,
});
