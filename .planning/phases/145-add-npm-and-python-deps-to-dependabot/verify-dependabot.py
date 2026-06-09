#!/usr/bin/env python3
"""Verify .github/dependabot.yml satisfies Phase 145 decisions D-01..D-06.

Asserts:
  - Valid YAML, version 2 (YAML validity check)
  - Exactly the ecosystems github-actions, npm, uv (D-01, D-02; no legacy pip)
  - npm covers root "/" AND infra "/infra"; uv directory "/data" (D-01, D-02, D-06)
  - Every entry schedule.interval == "weekly" (D-04)
  - Every entry has a groups block whose update-types includes minor+patch,
    and no group lists major (D-03 grouping; D-05 applies it to github-actions)
Exits 0 and prints "ALL CHECKS PASS" on success; raises AssertionError otherwise.
"""
import yaml

d = yaml.safe_load(open(".github/dependabot.yml"))
assert d["version"] == 2, f"version != 2: {d.get('version')}"

eco = {u["package-ecosystem"] for u in d["updates"]}
assert eco == {"github-actions", "npm", "uv"}, f"ecosystems: {sorted(eco)}"
assert "pip" not in eco, "legacy pip ecosystem present (D-02 violated)"

# npm spans two projects (root + infra) so key directories, not the ecosystem name.
npm_dirs = {u["directory"] for u in d["updates"] if u["package-ecosystem"] == "npm"}
assert npm_dirs == {"/", "/infra"}, f"npm directories: {sorted(npm_dirs)} (want / and /infra — D-01, D-06)"
uv_dirs = {u["directory"] for u in d["updates"] if u["package-ecosystem"] == "uv"}
assert uv_dirs == {"/data"}, f"uv directories: {sorted(uv_dirs)}"

for u in d["updates"]:
    label = f'{u["package-ecosystem"]} {u["directory"]}'
    assert u["schedule"]["interval"] == "weekly", f"{label} not weekly"
    groups = u.get("groups") or {}
    assert groups, f"{label} missing groups block"
    has_minor_patch = any(
        set(g.get("update-types", [])) >= {"minor", "patch"} for g in groups.values()
    )
    assert has_minor_patch, f"{label} group lacks minor+patch (D-03)"
    no_major = all(
        "major" not in g.get("update-types", []) for g in groups.values()
    )
    assert no_major, f"{label} group lists major (D-03 wants major ungrouped)"
    print(f"OK {label}: weekly, minor+patch grouped, major ungrouped")

print("ALL CHECKS PASS")
