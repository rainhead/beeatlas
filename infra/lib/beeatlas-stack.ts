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

    // ── CloudFront Access Logs Bucket ──────────────────────────────────────
    // Manually created 2026-04-25; imported here so CDK manages the reference.
    const logBucket = s3.Bucket.fromBucketName(this, 'CfLogBucket', 'beeatlas-cf-logs');

    // ── Main CloudFront Distribution (beeatlas.net) ───────────────────────
    // Use S3BucketOrigin.withOriginAccessControl() (stable since CDK v2.156.0).
    // Do NOT use deprecated S3Origin (OAI). Do NOT set websiteIndexDocument on bucket.
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Auto-gzip/brotli responses whose Content-Type is on AWS's allowlist
        // (text/*, application/json, application/javascript, etc.) and which are
        // > 1 KB. Default in CDK is false; we want it on for the bundled JS.
        compress: true,
      },
      defaultRootObject: 'index.html',
      domainNames: ['beeatlas.net', 'www.beeatlas.net'],
      certificate: siteCert,
      logBucket,
      logFilePrefix: 'cf-logs/',
    });

    // ── /data/* cache behavior with CORS headers ──────────────────────────
    // Cache policy: include Origin in cache key so CORS responses are cached per-origin.
    // Do NOT use CACHING_OPTIMIZED (it does not include Origin in the cache key).
    const dataCachePolicy = new cloudfront.CachePolicy(this, 'DataCachePolicy', {
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Origin'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      // Required for CloudFront's auto-compression to fire on this behavior —
      // without these, `compress: true` on the behavior is silently a no-op.
      // The cache key varies by Accept-Encoding so compressed and uncompressed
      // versions get separate cache entries.
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Response headers policy: expose CORS + Range/ETag headers to the browser.
    // No S3 bucket CORS config needed with OAC + ResponseHeadersPolicy.
    const dataCorsPolicy = new cloudfront.ResponseHeadersPolicy(this, 'DataCorsPolicy', {
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowOrigins: ['*'],
        accessControlExposeHeaders: ['Content-Range', 'Content-Length', 'ETag'],
        originOverride: true,
      },
    });

    distribution.addBehavior('/data/*',
      origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
      {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: dataCachePolicy,
        responseHeadersPolicy: dataCorsPolicy,
        // species.json + region GeoJSONs are large and compressible. AWS's
        // allowlist covers application/json — we upload .geojson with that
        // content-type so CloudFront compresses them too (allowlist doesn't
        // include application/geo+json; not configurable).
        compress: true,
      }
    );

    // ── /app/sw.js + /app/manifest.webmanifest: no-cache behaviors ────────
    // Zero-TTL so CloudFront revalidates on every request. SW update detection
    // requires the browser to always fetch the latest sw.js (the browser's 24h
    // SW-check maximum is undermined by any CloudFront caching). Per-path only —
    // NOT /app/* — so Phase 148's app-shell caching is unaffected (D-08, D-09).
    const swNoCachePolicy = new cloudfront.CachePolicy(this, 'SwNoCachePolicy', {
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(0),
      minTtl: cdk.Duration.seconds(0),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: false,
      enableAcceptEncodingBrotli: false,
    });

    // Response headers policy: set Cache-Control: no-cache so the browser
    // always revalidates the SW script and manifest (override: true ensures
    // CloudFront overrides any S3 origin response header).
    const swNoCacheHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SwNoCacheHeadersPolicy', {
      customHeadersBehavior: {
        customHeaders: [{
          header: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate',
          override: true,
        }],
      },
    });

    distribution.addBehavior('/app/sw.js',
      origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
      {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: swNoCachePolicy,
        responseHeadersPolicy: swNoCacheHeadersPolicy,
      }
    );

    // /app/manifest.webmanifest behavior added now (Phase 151 delivers the file;
    // the path-pattern behavior is harmless before the file exists — D-08).
    distribution.addBehavior('/app/manifest.webmanifest',
      origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
      {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: swNoCachePolicy,
        responseHeadersPolicy: swNoCacheHeadersPolicy,
      }
    );

    // maderas (the Linode serving host): api.beeatlas.net has always resolved
    // here; as of stelis ADR 0007 (serve-from-maderas) the apex + www do too.
    const maderasIpv4 = '45.79.96.48';
    const maderasIpv6 = '2600:3c01::f03c:92ff:feb3:476f';

    // ── Route 53 records for beeatlas.net (apex + www) → maderas (ADR 0007) ──
    // Flipped from the CloudFront alias to a direct dual-stack A/AAAA at maderas,
    // which now serves the rendered site via Apache
    // (infra/maderas/beeatlas.net.conf, docs/runbooks/serve-from-maderas.md) —
    // the same shape as the api record below. `distribution` + siteBucket stay
    // DEFINED (never destroyed here): rollback is reverting these records to the
    // CloudFront alias below and redeploying, while the distribution is still warm.
    //   const siteTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    for (const recordName of [undefined, 'www']) {
      new route53.ARecord(this, `NetA${recordName ?? 'Apex'}`, {
        zone: netZone, recordName,
        target: route53.RecordTarget.fromIpAddresses(maderasIpv4),
      });
      new route53.AaaaRecord(this, `NetAAAA${recordName ?? 'Apex'}`, {
        zone: netZone, recordName,
        target: route53.RecordTarget.fromIpAddresses(maderasIpv6),
      });
    }

    // ── Route 53 record: api.beeatlas.net → maderas (Phase 178 write layer) ──
    // Plain A record to a fixed IP, NOT a CloudFront alias — api.beeatlas.net
    // serves directly from maderas via Apache mod_proxy_http -> Waitress
    // (D-17), with its own certbot-issued TLS cert (independent of the
    // CloudFront ACM certs used for beeatlas.net / beeatlas.com). Surgical,
    // additive-only edit — never touch siteBucket/distribution/OIDC role/
    // AuthoritativeBackupBucket here, and never `cdk destroy`
    // (memory project_cdk_stack_composition).
    new route53.ARecord(this, 'ApiA', {
      zone: netZone,
      recordName: 'api',
      target: route53.RecordTarget.fromIpAddresses(maderasIpv4),
    });

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
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
      ],
    }));

    // ── Pipeline IAM User (beeatlas-pipeline) ────────────────────────────
    // Used by the nightly cron on maderas. Access keys are managed outside
    // CDK — create via console/CLI after first deploy and store in
    // ~/.aws/credentials on maderas under profile [beeatlas].
    //
    // Migration: delete the manually-created user + inline policy before
    // running `cdk deploy`, then create new access keys for maderas.
    const pipelineUser = new iam.User(this, 'PipelineUser', {
      userName: 'beeatlas-pipeline',
    });

    pipelineUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [
        siteBucket.arnForObjects('data/*'),
        siteBucket.arnForObjects('db/*'),
        siteBucket.arnForObjects('raw/*'),
      ],
    }));

    pipelineUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
    }));

    // ── Authoritative Store Backup Bucket ─────────────────────────────────
    // Separate from siteBucket: neither the GitHub OIDC deployer role nor the
    // derived pipeline can accidentally reach this via their existing policies.
    // RemovalPolicy.RETAIN: never auto-delete authoritative backups (contrast
    // siteBucket which is DESTROY because it is 100% reproducible from source).
    const backupBucket = new s3.Bucket(this, 'AuthoritativeBackupBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(180),
          noncurrentVersionExpiration: cdk.Duration.days(180),
        },
      ],
    });

    // Pipeline IAM user (maderas nightly + backup script) gets PutObject + GetObject
    // on the backup bucket ONLY — NOT DeleteObject (S3 Versioning is the recovery layer).
    // The deployer OIDC role (deployerRole) gets NO grant here — structural STORE-04 boundary.
    pipelineUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [backupBucket.arnForObjects('*')],
    }));

    // ListBucket at bucket level — required for restore-drill `aws s3 ls s3://<backup>/backups/`
    pipelineUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [backupBucket.bucketArn],
    }));

    new cdk.CfnOutput(this, 'BackupBucketName', {
      value: backupBucket.bucketName,
      description: 'Authoritative backup bucket → NOTES_BACKUP_BUCKET env var on maderas',
    });

    // ── Pipeline Backup Bucket (Model Y step D, st-pry) ───────────────────
    // Offsite DR for the nightly's working state: the DuckDB (persistent at
    // /var/www/beeatlas.net/var/ since Model Y) and the taxa cache. Same-host
    // is not a backup. Mirrors AuthoritativeBackupBucket rather than sharing
    // it: the duckdb is derived-but-expensive pipeline state, not the
    // authoritative store, and the buckets retire on different terms. Moving
    // these keys out of siteBucket (db/*, raw/*) unblocks st-vjd's
    // site-bucket teardown.
    const pipelineBackupBucket = new s3.Bucket(this, 'PipelineBackupBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(180),
          noncurrentVersionExpiration: cdk.Duration.days(180),
        },
      ],
    });

    // Same grant shape as the authoritative bucket: Put/Get only (versioning
    // is the recovery layer, no DeleteObject), plus ListBucket for restore
    // drills. The OIDC deployer role gets NO grant here.
    pipelineUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [pipelineBackupBucket.arnForObjects('*')],
    }));
    pipelineUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [pipelineBackupBucket.bucketArn],
    }));

    new cdk.CfnOutput(this, 'PipelineBackupBucketName', {
      value: pipelineBackupBucket.bucketName,
      description: 'Pipeline backup bucket → PIPELINE_BACKUP_BUCKET in the maderas crontab (nightly.sh backup trap)',
    });

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
