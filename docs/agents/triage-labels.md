# Triage Labels

BeeAtlas tracks work in **beads** (see [issue-tracker.md](issue-tracker.md)); triage operates on bd issues, not a public inbox. Map each canonical triage role to a bd label (`bd update <id> --labels …`):

| Canonical role    | bd label          | Meaning                                   |
| ----------------- | ----------------- | ----------------------------------------- |
| `needs-triage`    | `needs-triage`    | Not yet evaluated                          |
| `needs-info`      | `needs-info`      | Blocked pending more information           |
| `ready-for-agent` | `ready-for-agent` | Fully specified, an agent can pick it up   |
| `ready-for-human` | `ready-for-human` | Requires human implementation              |
| `wontfix`         | (close with reason) | Use `bd close <id> --reason "wontfix: …"` |

Since this is a solo project, most issues skip formal triage — file with the right `-t`/`-p` and go. The labels exist for when an agent needs to hand work back.
