import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

// ACM certificates for CloudFront must live in us-east-1 regardless of where
// the CloudFront distribution is managed.  Route 53 is global so the hosted
// zones can be created here too and passed to the main stack.
export class GlobalStack extends cdk.Stack {
  readonly netZone: route53.HostedZone;
  readonly comZone: route53.HostedZone;
  readonly siteCert: acm.Certificate;
  readonly redirectCert: acm.Certificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Route 53 Hosted Zones ──────────────────────────────────────────────
    this.netZone = new route53.HostedZone(this, 'NetZone', {
      zoneName: 'beeatlas.net',
    });
    this.comZone = new route53.HostedZone(this, 'ComZone', {
      zoneName: 'beeatlas.com',
    });

    // ── ACM Certificates (DNS-validated) ───────────────────────────────────
    this.siteCert = new acm.Certificate(this, 'SiteCert', {
      domainName: 'beeatlas.net',
      subjectAlternativeNames: ['www.beeatlas.net'],
      validation: acm.CertificateValidation.fromDns(this.netZone),
    });
    this.redirectCert = new acm.Certificate(this, 'RedirectCert', {
      domainName: 'beeatlas.com',
      subjectAlternativeNames: ['www.beeatlas.com'],
      validation: acm.CertificateValidation.fromDns(this.comZone),
    });

    // ── Outputs: nameservers to enter at the domain registrar ─────────────
    new cdk.CfnOutput(this, 'NetNameServers', {
      value: cdk.Fn.join(', ', this.netZone.hostedZoneNameServers!),
      description: 'beeatlas.net nameservers → update at registrar',
    });
    new cdk.CfnOutput(this, 'ComNameServers', {
      value: cdk.Fn.join(', ', this.comZone.hostedZoneNameServers!),
      description: 'beeatlas.com nameservers → update at registrar',
    });
  }
}
