#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BeeAtlasStack } from '../lib/beeatlas-stack';

const app = new cdk.App();
new BeeAtlasStack(app, 'BeeAtlasStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
