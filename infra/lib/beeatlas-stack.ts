import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    const { netZone, comZone, redirectCert } = props.global;

    // ── Serving infra: RETIRED (st-vjd, post-Model-Y teardown) ────────────
    // The SiteBucket, SiteDistribution (E3SAI2PQ8FN0E7), their cache/CORS/
    // no-cache policies, the GitHub OIDC provider + deployer role, and the
    // pipeline user's site-bucket grants were deleted 2026-07-19 after the
    // Model Y soak (stelis ADR 0007): maderas serves the site directly via
    // Apache (infra/maderas/beeatlas.net.conf,
    // docs/runbooks/serve-from-maderas.md). What remains here is DNS, the
    // beeatlas.com → beeatlas.net redirect, and the two backup buckets.

    // maderas (the Linode serving host): api.beeatlas.net has always resolved
    // here; as of stelis ADR 0007 (serve-from-maderas) the apex + www do too.
    const maderasIpv4 = '45.79.96.48';
    const maderasIpv6 = '2600:3c01::f03c:92ff:feb3:476f';

    // ── Route 53 records for beeatlas.net (apex + www) → maderas (ADR 0007) ──
    // Direct dual-stack A/AAAA at maderas, which serves the rendered site via
    // Apache — the same shape as the api record below.
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
    // Plain A record to a fixed IP — api.beeatlas.net serves directly from
    // maderas via Apache mod_proxy_http -> Waitress (D-17), with its own
    // certbot-issued TLS cert (independent of the CloudFront ACM cert still
    // used by the beeatlas.com redirect). Never `cdk destroy`
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
        // CloudFront requires an origin, but the viewer-request function 301s
        // before any origin contact — this HttpOrigin is never actually hit.
        // (Was the now-deleted siteBucket before the st-vjd teardown.)
        origin: new origins.HttpOrigin('beeatlas.net'),
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

    // ── Pipeline IAM User (beeatlas-pipeline) ────────────────────────────
    // Used by the nightly cron on maderas (backup uploads only since st-vjd —
    // the site-bucket and CloudFront-invalidation grants left with the
    // serving infra). Access keys are managed outside CDK — create via
    // console/CLI after first deploy and store in ~/.aws/credentials on
    // maderas under profile [beeatlas].
    const pipelineUser = new iam.User(this, 'PipelineUser', {
      userName: 'beeatlas-pipeline',
    });

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

  }
}
