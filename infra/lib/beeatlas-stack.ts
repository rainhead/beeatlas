import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { GlobalStack } from './global-stack';

interface BeeAtlasStackProps extends cdk.StackProps {
  global: GlobalStack;
}

export class BeeAtlasStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BeeAtlasStackProps) {
    super(scope, id, props);

    const { netZone, comZone, siteCert, redirectCert } = props.global;

    // ── S3 Bucket (private — no website hosting mode) ─────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,  // safe: bucket and distribution are in the same stack
    });

    // ── Main CloudFront Distribution (beeatlas.net) ───────────────────────
    // Use S3BucketOrigin.withOriginAccessControl() (stable since CDK v2.156.0).
    // Do NOT use deprecated S3Origin (OAI). Do NOT set websiteIndexDocument on bucket.
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      domainNames: ['beeatlas.net', 'www.beeatlas.net'],
      certificate: siteCert,
    });

    // ── Route 53 records for beeatlas.net (apex + www) ────────────────────
    const siteTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    for (const recordName of [undefined, 'www']) {
      new route53.ARecord(this, `NetA${recordName ?? 'Apex'}`, {
        zone: netZone, recordName, target: siteTarget,
      });
      new route53.AaaaRecord(this, `NetAAAA${recordName ?? 'Apex'}`, {
        zone: netZone, recordName, target: siteTarget,
      });
    }

    // ── Redirect: beeatlas.com → beeatlas.net ─────────────────────────────
    // A CloudFront Function returns a 301 at the viewer-request stage so the
    // origin (siteBucket) is never actually contacted for .com requests.
    const redirectFn = new cloudfront.Function(this, 'ComRedirectFn', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: 'https://beeatlas.net' + event.request.uri } },
  };
}
`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const redirectDistribution = new cloudfront.Distribution(this, 'RedirectDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{
          function: redirectFn,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      domainNames: ['beeatlas.com', 'www.beeatlas.com'],
      certificate: redirectCert,
    });

    // ── Route 53 records for beeatlas.com (apex + www) ────────────────────
    const redirectTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(redirectDistribution));
    for (const recordName of [undefined, 'www']) {
      new route53.ARecord(this, `ComA${recordName ?? 'Apex'}`, {
        zone: comZone, recordName, target: redirectTarget,
      });
      new route53.AaaaRecord(this, `ComAAAA${recordName ?? 'Apex'}`, {
        zone: comZone, recordName, target: redirectTarget,
      });
    }

    // ── GitHub OIDC Provider ───────────────────────────────────────────────
    // One per AWS account per URL. No thumbprints needed as of late 2024.
    // If cdk deploy fails with "Provider already exists", replace this block with:
    //   const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
    //     this, 'GitHubOidcProvider',
    //     `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    //   );
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // ── Deployer Role ──────────────────────────────────────────────────────
    // Scoped to rainhead/beeatlas repo (any branch/tag/environment).
    // StringLike allows wildcards; StringEquals is exact match for audience.
    const deployerRole = new iam.Role(this, 'GitHubDeployerRole', {
      roleName: 'beeatlas-github-deployer',
      assumedBy: new iam.WebIdentityPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': 'repo:rainhead/beeatlas:*',
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        },
      ),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Allow deployer to assume CDK bootstrap roles (needed for cdk deploy from CI)
    deployerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
    }));

    // Grant direct S3 read/write (workflow syncs frontend/dist/ directly)
    siteBucket.grantReadWrite(deployerRole);

    // Grant CloudFront invalidation (workflow runs create-invalidation after S3 sync)
    deployerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudfront:CreateInvalidation'],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
      ],
    }));

    // ── Outputs (consumed as GitHub Actions secrets) ──────────────────────
    new cdk.CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket name → GitHub secret S3_BUCKET_NAME',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID → GitHub secret CF_DISTRIBUTION_ID',
    });
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain for verifying the live site',
    });
    new cdk.CfnOutput(this, 'DeployerRoleArn', {
      value: deployerRole.roleArn,
      description: 'OIDC deployer role ARN → GitHub secret AWS_DEPLOYER_ROLE_ARN',
    });
  }
}
