# Serve beeatlas.net from maderas

Cutover runbook for stelis ADR 0007 (st-bgy): beeatlas.net moves from
S3 + CloudFront to an Apache vhost on maderas serving a root that the
nightly (and later the note-write path, st-nee) publishes into. The vhost
config is tracked at [`infra/maderas/beeatlas.net.conf`](../../infra/maderas/beeatlas.net.conf);
the publish logic lives in [`data/nightly.sh`](../../data/nightly.sh)
(`SITE_ROOT`, `PUBLISH_S3`).

Maderas IP: `45.79.96.48`. DNS: Route 53 (the `beeatlas.net` hosted zone).

## 1. One-time install (sudo, on maderas)

```sh
sudo mkdir -p /var/www/beeatlas.net
sudo chown "$USER": /var/www/beeatlas.net
sudo cp ~/dev/beeatlas/infra/maderas/beeatlas.net.conf /etc/apache2/sites-available/
sudo a2ensite beeatlas.net
sudo apachectl configtest && sudo systemctl reload apache2
```

(mod_headers / rewrite / deflate / ssl are already enabled on maderas.)

## 2. Prime the served root

Either wait for the 03:00 nightly (its publish step now merges into
`SITE_ROOT=/var/www/beeatlas.net` whenever that directory exists), or run
`data/nightly.sh` manually. Then spot-check **before** touching DNS:

```sh
curl -sI -H 'Host: beeatlas.net' http://45.79.96.48/ | grep -Ei 'HTTP|cache-control'          # 200, max-age=0
curl -sI -H 'Host: beeatlas.net' http://45.79.96.48/data/manifest.json | grep -i cache-control # no-cache
# any hashed asset from the manifest: expect max-age=31536000, immutable
```

## 3. DNS flip (Route 53)

The apex is an ALIAS to CloudFront; `www` points there too. Replace both
with plain A records to maderas (TTL 300 while soaking):

```sh
ZONE=$(aws --profile beeatlas route53 list-hosted-zones-by-name --dns-name beeatlas.net \
        --query 'HostedZones[0].Id' --output text)
aws --profile beeatlas route53 change-resource-record-sets --hosted-zone-id "$ZONE" \
  --change-batch '{"Changes":[
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"beeatlas.net","Type":"A","TTL":300,"ResourceRecords":[{"Value":"45.79.96.48"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"www.beeatlas.net","Type":"A","TTL":300,"ResourceRecords":[{"Value":"45.79.96.48"}]}}]}'
```

**Rollback** is re-pointing these records at the CloudFront distribution
(still warm, untouched): restore the apex ALIAS + `www` CNAME to
`E3SAI2PQ8FN0E7`'s domain name.

## 4. TLS (after DNS resolves to maderas)

```sh
sudo certbot --apache -d beeatlas.net -d www.beeatlas.net
```

certbot clones the port-80 vhost into `beeatlas.net-le-ssl.conf` and adds
the HTTPS redirect — the same shape as `api.beeatlas.net`.

## 5. Verify, then retire the S3 leg

- `https://beeatlas.net/` loads; a species page's notes render; headers as in §2.
- Service worker: hard-reload twice, check `/data/manifest.json` fetches live.
- After a green nightly + soak: set `PUBLISH_S3=0` in the crontab line
  (`PUBLISH_S3=0 $HOME/dev/beeatlas/data/nightly.sh …`) — this also stops the
  GH-Actions dispatch (deploy.yml builds *from* S3 and must not run against a
  retired bucket). Full teardown (bucket, distribution, deploy IAM,
  `/api/notes`) is **st-vjd**, only after burned-in reload-sees-it is verified.
