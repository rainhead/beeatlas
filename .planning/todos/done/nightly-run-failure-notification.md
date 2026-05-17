---
created: 2026-05-13
priority: medium
context: surfaced during v3.4 milestone scoping (after v3.3 dbt Spike)
---

# Nightly run failure notification

## Problem

`data/nightly.sh` runs on maderas via cron. If it fails (pipeline crash, dbt test error, S3 upload failure, network blip), there's no automatic notification. Failures are only discovered the next time the user notices stale data on the site — which can be days later for a solo-operated project.

## Goal

Notify the user out-of-band when the nightly run does NOT complete successfully (any non-zero exit, or no completion log within an expected window).

## Constraints

- The pipeline runs on `maderas` (the user's personal machine), not in AWS. AWS-native solutions (SNS, EventBridge alarms on Lambda) do not apply unless we move execution.
- Solo user — the notification target is one person. No on-call rotation, no Slack workspace needed unless the user already uses one for this.
- Cost-sensitive: prefer free / already-paid channels.

## Candidate channels (to evaluate)

- Email (smtp via Gmail with app password; or a transactional service free tier)
- SMS via a service like Twilio (cost) or a free-tier alternative
- A push notification to phone (Pushover, ntfy.sh — ntfy.sh has a free self-hostable + free public tier)
- macOS local notification + a "Did it run today?" check on login
- A health-check service that pings the user when an expected ping doesn't arrive (Healthchecks.io has a generous free tier and is the canonical "dead man's switch" tool for cron jobs — probably the right shape here)

## Recommended shape

Healthchecks.io-style dead-man's switch: `nightly.sh` pings a URL on successful completion; if no ping arrives within the expected window, the service emails/SMSes the user. This catches both "ran and crashed" and "never ran" (e.g., laptop closed). Healthchecks.io free tier covers this case at no cost.

## When to surface

- After v3.4 dbt Full Rewrite if `nightly.sh` is significantly modified (the rewrite touches the orchestration shell), this is a natural follow-on
- Could be a Quick Task at any time — it's small enough (~30 lines of shell + curl) to fit outside the phase workflow

## Status

Pending — captured during v3.4 milestone scoping.
