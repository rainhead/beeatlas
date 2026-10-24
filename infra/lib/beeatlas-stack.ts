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
    // Model Y soak (stelis ADR 0007), when maderas served the site through
    // Apache. Since 2026-10-23 the Fly app serves it (ADR 0042). What remains
    // here is DNS, the beeatlas.com → beeatlas.net redirect, and the two backup
    // buckets.

    // The beeatlas Fly app (ADR 0042, beeatlas-j65i): a shared IPv4 and a dedicated
    // IPv6, from `fly ips list -a beeatlas`. beeatlas.net, www and api point here
    // since the cutover.
    const flyIpv4 = '66.241.125.154';
    const flyIpv6 = '2a09:8280:1::1c6:fdad:0';

    // ── Route 53 records for beeatlas.net (apex + www) → the Fly app (ADR 0042) ──
    // Direct dual-stack A/AAAA. Fly's proxy terminates TLS and forwards to Caddy
    // on the one Machine. Until 2026-10-23 these pointed at maderas, which served
    // the site through Apache (ADR 0007). The AAAA records stay: on 2026-07-31
    // dropping them did not fix a visitor's stalls, and removing IPv6 for
    // everyone else bought nothing.
    // A one-minute TTL for the Fly cutover (beeatlas-j65i): the flip, and a rollback,
    // reach resolvers within a minute instead of CDK's default 30.
    const cutoverTtl = cdk.Duration.seconds(60);
    for (const recordName of [undefined, 'www']) {
      new route53.ARecord(this, `NetA${recordName ?? 'Apex'}`, {
        zone: netZone, recordName, ttl: cutoverTtl,
        target: route53.RecordTarget.fromIpAddresses(flyIpv4),
      });
      new route53.AaaaRecord(this, `NetAAAA${recordName ?? 'Apex'}`, {
        zone: netZone, recordName, ttl: cutoverTtl,
        target: route53.RecordTarget.fromIpAddresses(flyIpv6),
      });
    }

    // The Fly app's certificates, issued before DNS moves (beeatlas-j65i): Fly answers
    // each name's ACME DNS challenge through this CNAME, so beeatlas.net, www and api
    // have valid certificates on Fly the moment the A/AAAA records point there.
    for (const host of ['', 'www.', 'api.']) {
      new route53.CnameRecord(this, `FlyAcme${host ? host.slice(0, -1) : 'Apex'}`, {
        zone: netZone,
        recordName: `_acme-challenge.${host}beeatlas.net`,
        domainName: `${host}beeatlas.net.gdoq6qw.flydns.net`,
      });
    }

    // ── Route 53 records: api.beeatlas.net → the Fly app (the write API) ──
    // The same Machine as the site: Caddy routes the api host to Waitress, and
    // Fly holds its certificate. Until the cutover it was maderas, through
    // Apache mod_proxy_http with a certbot certificate. Never `cdk destroy`
    // (memory project_cdk_stack_composition).
    new route53.ARecord(this, 'ApiA', {
      zone: netZone,
      recordName: 'api',
      ttl: cutoverTtl,
      target: route53.RecordTarget.fromIpAddresses(flyIpv4),
    });
    // Dual-stack on Fly, like the apex; on maderas api was IPv4-only.
    new route53.AaaaRecord(this, 'ApiAAAA', {
      zone: netZone,
      recordName: 'api',
      ttl: cutoverTtl,
      target: route53.RecordTarget.fromIpAddresses(flyIpv6),
    });

    // beeline.beeatlas.net pointed at maderas until 2026-10-24, latterly only to
    // redirect to beeline.fly.dev. The name is retired: Beeline answers at its
    // Fly hostname (~/dev/beeline, docs/runbooks/deploy-fly.md).

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
    // Used by the Fly Machine's nightly and hourly notes snapshot (backup
    // uploads only since st-vjd — the site-bucket and CloudFront-invalidation
    // grants left with the serving infra). Access keys are managed outside CDK
    // — create via console/CLI and set them on the Fly app as
    // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (`fly secrets set`).
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
        // The hourly snapshots (backups/, data/backup_notes.py) expire after 180 days.
        // Scoped to that prefix, which held every object when it was scoped
        // (2026-10-22), so the replica below is not expired with them.
        {
          prefix: 'backups/',
          expiration: cdk.Duration.days(180),
          noncurrentVersionExpiration: cdk.Duration.days(180),
        },
        // The Litestream replica (replica/, beeatlas-lwqi) is never expired while
        // current: Litestream writes no new snapshot while the store is idle, so a store
        // unwritten for 180 days would otherwise lose its only restorable copy.
        // Litestream retires its own files; what it deletes is kept 180 days.
        {
          prefix: 'replica/',
          noncurrentVersionExpiration: cdk.Duration.days(180),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    // Pipeline IAM user (the nightly + backup script) gets PutObject + GetObject
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
      description: 'Authoritative backup bucket → NOTES_BACKUP_BUCKET on the Fly app',
    });

    // The notes store's continuous replica (beeatlas-lwqi): Litestream on the Fly
    // Machine, under replica/ in the same bucket. Its own user, because Litestream must
    // DELETE (it retires WAL segments and old snapshots), which the pipeline user is
    // deliberately denied above. The grant is that prefix and nothing else; the bucket's
    // versioning keeps anything deleted there for 180 days, so a wrong retention setting
    // or a leaked key is recoverable. Its key is created by hand and set as the Fly
    // secrets NOTES_REPLICA_AWS_ACCESS_KEY_ID / _SECRET_ACCESS_KEY, which fly/start.sh
    // hands to Litestream alone.
    const NOTES_REPLICA_PREFIX = 'replica';
    // The bucket's lifecycle leaves replica/'s current objects alone (above).
    const notesReplicaWriter = new iam.User(this, 'NotesReplicaWriter', { userName: 'beeatlas-notes-replica' });
    notesReplicaWriter.addToPolicy(new iam.PolicyStatement({
      sid: 'ListReplica',
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [backupBucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': [`${NOTES_REPLICA_PREFIX}/*`, NOTES_REPLICA_PREFIX] } },
    }));
    notesReplicaWriter.addToPolicy(new iam.PolicyStatement({
      sid: 'KeepReplica',
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [backupBucket.arnForObjects(`${NOTES_REPLICA_PREFIX}/*`)],
    }));
    new cdk.CfnOutput(this, 'NotesReplicaWriterName', {
      value: notesReplicaWriter.userName,
      description: "The Fly Machine's Litestream identity: the notes store's replica under replica/ (beeatlas-lwqi)",
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
        // The nightly's state (db/, raw/) is rewritten every night, so a current
        // object never ages; the expiry only clears what the nightly stopped writing.
        // Scoped to those prefixes, which held every object when it was scoped
        // (2026-10-22).
        ...['db/', 'raw/'].map((prefix) => ({
          prefix,
          expiration: cdk.Duration.days(180),
          noncurrentVersionExpiration: cdk.Duration.days(180),
        })),
        // The basemap archives (basemap/, data/publish-basemap.sh, beeatlas-g3xy) are
        // replaced quarterly at best, so a current one can be older than 180 days and
        // must not expire: it is the only copy beside the serving host's.
        {
          prefix: 'basemap/',
          noncurrentVersionExpiration: cdk.Duration.days(180),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
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
      description: 'Pipeline backup bucket → PIPELINE_BACKUP_BUCKET on the Fly app (nightly.sh backup trap)',
    });

  }
}
