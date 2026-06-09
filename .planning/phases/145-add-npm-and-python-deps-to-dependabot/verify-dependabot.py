#!/usr/bin/env python3
"""Verify .github/dependabot.yml satisfies Phase 145 decisions D-01..D-05.

Asserts:
  - Valid YAML, version 2 (YAML validity check)
  - Exactly the ecosystems github-actions, npm, uv (D-01, D-02; no legacy pip)
  - npm directory "/", uv directory "/data" (D-01, D-02)
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

by_eco = {u["package-ecosystem"]: u for u in d["updates"]}
assert by_eco["npm"]["directory"] == "/", by_eco["npm"]["directory"]
assert by_eco["uv"]["directory"] == "/data", by_eco["uv"]["directory"]

for name, u in by_eco.items():
    assert u["schedule"]["interval"] == "weekly", f"{name} not weekly"
    groups = u.get("groups") or {}
    assert groups, f"{name} missing groups block"
    has_minor_patch = any(
        set(g.get("update-types", [])) >= {"minor", "patch"} for g in groups.values()
    )
    assert has_minor_patch, f"{name} group lacks minor+patch (D-03)"
    no_major = all(
        "major" not in g.get("update-types", []) for g in groups.values()
    )
    assert no_major, f"{name} group lists major (D-03 wants major ungrouped)"
    print(f"OK {name}: weekly, minor+patch grouped, major ungrouped")

print("ALL CHECKS PASS")
