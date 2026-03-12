# Phase 11: Links Pipeline - Research

**Researched:** 2026-03-11
**Domain:** Python HTTP scraping, BeautifulSoup, Parquet, two-level caching
**Confidence:** HIGH

## Summary

Phase 11 builds a Python pipeline that reads all records from the Ecdysis WA occurrence data, fetches each specimen's individual page from `ecdysis.org`, extracts the iNaturalist observation ID from the `#association-div` link, and writes `links.parquet` with columns `occurrenceID` (string UUID) and `inat_observation_id` (Int64, nullable). A two-level skip prevents redundant HTTP requests: first skip if the record is already in `links.parquet`, second skip if the raw HTML is already cached on disk.

The existing prototype `data/scripts/fetch_inat_links.py` implements the correct overall structure but has one critical bug and several structural issues. The critical bug is that the Ecdysis individual-record URL uses the **integer** occurrence database ID (`id` column, e.g. `5594056`) as the `occid` query parameter, not the UUID `occurrenceID`. The prototype reads `df['occurrenceID']` (UUID strings) and passes them as `occid=`, which will either 404 or return a page without the associations section. All other core logic — rate limiting at 20 req/sec, BeautifulSoup CSS selector, disk HTML cache, Int64 nullable dtype — is correct.

The module should live in `data/links/` (a new top-level module following the `data/inat/` and `data/ecdysis/` pattern), be runnable as `uv run python -m links.fetch` from the `data/` directory, and be exposed as `npm run fetch-links` from the root. The input file is `data/ecdysis.parquet` (the current pipeline output). No changes to `ecdysis/occurrences.py` are needed: `ecdysis.parquet` already contains `ecdysis_id` (the integer used for URL construction) alongside the data needed to map back to `occurrenceID`. However, `occurrenceID` was dropped in `to_parquet()` — the pipeline must read `occurrenceID` from the raw zip, OR the `ecdysis.parquet` schema must be extended to include it.

**Primary recommendation:** Add `occurrenceID` to `ecdysis.parquet` by updating `occurrences.py::to_parquet()` to include it, then use `ecdysis.parquet` as the Phase 11 input. This is simpler than maintaining a separate `ecdysis_wa.parquet`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LINK-01 | Pipeline reads all occurrenceIDs from `ecdysis_wa.parquet` and fetches each Ecdysis individual record page at max 20 req/sec, caching raw HTML to disk | Ecdysis URL confirmed: `?occid={integer_id}&clid=0` with User-Agent header; rate limiter pattern from prototype is correct; input file is `ecdysis.parquet` (need occurrenceID added) |
| LINK-02 | Pipeline skips HTTP fetch for occurrenceIDs already present in `links.parquet` (first-level skip) or already in the local HTML cache (second-level skip, parse without fetching) | Two-level skip logic: load existing links.parquet set, check disk cache per occurrenceID; rate limiter must NOT fire for either skip type |
| LINK-03 | Pipeline extracts iNat observation ID from `#association-div a[target="_blank"]` href; records null if the element is absent | Verified live: `soup.select_one('#association-div a[target="_blank"]')` returns anchor; `href.split('/')[-1]` yields the integer observation ID; None when absent |
| LINK-04 | Pipeline produces `links.parquet` with columns `occurrenceID` (string) and `inat_observation_id` (Int64, nullable), covering all occurrenceIDs | pandas `pd.Int64Dtype()` for nullable; `to_parquet(engine='pyarrow', compression='snappy')`; existing links.parquet merged with new results before writing |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| requests | 2.32.5 (pinned) | HTTP page fetching | Already in pyproject.toml; used in ecdysis/download.py |
| beautifulsoup4 | 4.14.3 (pinned) | HTML parsing, CSS selector | Already in pyproject.toml; used in prototype |
| pandas | 3.0.0+ | DataFrame operations, parquet I/O | Project standard; used in all pipelines |
| pyarrow | 22.0.0+ | Parquet engine | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pathlib.Path | stdlib | File paths | Always — project uses it throughout |
| time | stdlib | Rate limiting sleep | Simple 1/20 sec sleep between requests |

**Installation:** No new dependencies needed — all libraries already in `data/pyproject.toml`.

## Architecture Patterns

### Module Location

Follow `data/inat/` pattern: new module at `data/links/` with:
```
data/links/
├── __init__.py
└── fetch.py          # main pipeline logic
```

Run as: `cd data && uv run python -m links.fetch`

NOT as a script in `data/scripts/` — the prototype lives there as a throwaway; the real implementation goes in a proper module.

### Input File Clarification

The phase description says "reads all occurrenceIDs from `ecdysis_wa.parquet`". In the current codebase, that file does not exist. The actual equivalent is `data/ecdysis.parquet`, which is produced by `ecdysis/occurrences.py`. However, **`ecdysis.parquet` does NOT include the `occurrenceID` column** (it was dropped in `to_parquet()`).

Two options:
1. **Preferred:** Update `ecdysis/occurrences.py::to_parquet()` to include `occurrenceID` column, keep file named `ecdysis.parquet`.
2. **Alternative:** Read from the raw zip file in the links pipeline (more coupling, harder to test).

Option 1 is simpler. The `occurrenceID` column is `pd.StringDtype()` and is already in the `dtype` dict in `occurrences.py`.

### Recommended Project Structure

```
data/
├── links/
│   ├── __init__.py
│   └── fetch.py
├── ecdysis/
│   ├── occurrences.py    (update to_parquet to include occurrenceID)
│   └── ...
└── tests/
    └── test_links_fetch.py
```

### Pattern 1: Two-Level Skip with Correct Rate Limiting

The prototype has a rate-limiting bug: it sleeps between EVERY record including cached ones. Correct pattern:

```python
# Load existing links to skip (first-level skip set)
already_linked: set[str] = set()
if OUTPUT_PARQUET.exists():
    existing = pd.read_parquet(OUTPUT_PARQUET)
    already_linked = set(existing['occurrenceID'].dropna())

results = []
last_fetch_time: float = 0.0

for occurrenceID, ecdysis_id in zip(occurrence_ids, ecdysis_ids):
    # First-level skip: already in links.parquet
    if occurrenceID in already_linked:
        continue

    # Second-level skip: HTML already on disk
    cache_path = get_cache_path(ecdysis_id)
    if cache_path.exists():
        html = cache_path.read_text(encoding='utf-8')
        obs_id = extract_observation_id(html)
        results.append({'occurrenceID': occurrenceID, 'inat_observation_id': obs_id})
        continue

    # Rate limit only for actual HTTP requests
    elapsed = time.monotonic() - last_fetch_time
    if elapsed < RATE_LIMIT_SECONDS:
        time.sleep(RATE_LIMIT_SECONDS - elapsed)

    html = fetch_page(ecdysis_id)  # uses integer ecdysis_id
    last_fetch_time = time.monotonic()
    obs_id = extract_observation_id(html)
    results.append({'occurrenceID': occurrenceID, 'inat_observation_id': obs_id})
```

### Pattern 2: Merge and Write

After processing, merge new results with any existing `links.parquet` before writing:

```python
new_df = pd.DataFrame(results)
new_df['inat_observation_id'] = new_df['inat_observation_id'].astype('Int64')

if OUTPUT_PARQUET.exists():
    existing = pd.read_parquet(OUTPUT_PARQUET)
    # New results win on any overlap
    combined = (
        pd.concat([existing, new_df], ignore_index=True)
        .drop_duplicates(subset=['occurrenceID'], keep='last')
        .reset_index(drop=True)
    )
else:
    combined = new_df

combined.to_parquet(OUTPUT_PARQUET, index=False, compression='snappy', engine='pyarrow')
```

### Pattern 3: Ecdysis URL with User-Agent

```python
ECDYSIS_BASE = "https://ecdysis.org/collections/individual/index.php"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; beeatlas-data/1.0)"}

def fetch_page(ecdysis_id: int) -> str | None:
    url = f"{ECDYSIS_BASE}?occid={ecdysis_id}&clid=0"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.text
    except requests.RequestException as e:
        print(f"[links] ERROR fetching {ecdysis_id}: {e}")
        return None
```

**Critical:** Without a `User-Agent` header, Ecdysis returns HTTP 403. The prototype uses `requests.get()` with no headers — this will fail in production. (Verified: plain `requests.get` → 403, with browser User-Agent → 200.)

### Pattern 4: BeautifulSoup Extraction (Verified Live)

```python
from bs4 import BeautifulSoup

def extract_observation_id(html: str | None) -> int | None:
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    anchor = soup.select_one('#association-div a[target="_blank"]')
    if anchor and anchor.get('href'):
        try:
            return int(anchor['href'].split('/')[-1])
        except (ValueError, IndexError):
            return None
    return None
```

Live verification: `https://ecdysis.org/collections/individual/index.php?occid=5594056&clid=0` returns:
```html
<fieldset class="top-light-margin" id="association-div">
  <legend>Associations</legend>
  <div>hasHost: <a href="https://www.inaturalist.org/observations/157620392" target="_blank">...</a></div>
</fieldset>
```
Extracted ID: `157620392` (correct).

### Anti-Patterns to Avoid

- **Using UUID as occid URL param:** The Ecdysis `occid=` param takes the integer `id`, not the UUID `occurrenceID`. UUID pages load but return a shorter page without the associations section.
- **Rate limiting cached items:** Sleeping between cached records wastes time. Only sleep before actual HTTP requests.
- **No User-Agent header:** Plain `requests.get()` returns HTTP 403 from Ecdysis. Must set a User-Agent.
- **Overwriting links.parquet on error:** If the fetch loop errors mid-way, don't write partial results. Accumulate in memory and write atomically at the end.
- **Relative paths in module:** Use `Path(__file__).parent.parent` to locate data files, or configure paths relative to `data/` working directory (consistent with `inat/download.py` pattern).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing | Custom regex/string search | BeautifulSoup `select_one()` | Handles malformed HTML, CSS selectors, encoding |
| Parquet I/O with nullable ints | Custom serialization | pandas `Int64Dtype()` + pyarrow | Handles NA correctly in Parquet schema |
| Rate limiting | `time.sleep(fixed)` before every record | Sleep only before HTTP calls, using `time.monotonic()` | Cached hits don't need throttling |

## Common Pitfalls

### Pitfall 1: Ecdysis Returns 403 Without User-Agent
**What goes wrong:** `requests.get(url)` with no headers returns HTTP 403 from Ecdysis.
**Why it happens:** Ecdysis blocks requests with default Python/requests User-Agent string.
**How to avoid:** Always set `User-Agent` header. Any browser-like string works.
**Warning signs:** 403 status code in fetch loop.

### Pitfall 2: Wrong occid Parameter (Prototype Bug)
**What goes wrong:** Using UUID `occurrenceID` as the `occid=` URL parameter. The page loads (200) but is ~7300 chars instead of ~13000 chars and has no `association-div`.
**Why it happens:** The prototype reads `df['occurrenceID']` (UUIDs) and passes them as URL params. Ecdysis uses the integer database ID for `occid=`.
**How to avoid:** Use the `ecdysis_id` (integer) column for URL construction; output the UUID `occurrenceID` in the parquet.
**Warning signs:** All `inat_observation_id` values are null despite records having iNat links.

### Pitfall 3: Rate Limit Applied to All Records
**What goes wrong:** Sleeping 0.05s even for cached records; 46,090 records × 0.05s = 38 minutes of unnecessary sleep.
**Why it happens:** Prototype applies rate limit unconditionally in the loop.
**How to avoid:** Only sleep before actual HTTP fetch, after the cache check.
**Warning signs:** Fetch run takes much longer than expected given cache hit rate.

### Pitfall 4: links.parquet Missing occurrenceIDs
**What goes wrong:** Only new records (not already in links.parquet) end up in the output file.
**Why it happens:** If the merge step is missing, the output only contains the current session's newly fetched records.
**How to avoid:** Always merge new results with existing `links.parquet` before writing. All occurrenceIDs must appear in the output.
**Warning signs:** Row count in output is less than total occurrenceIDs in ecdysis.parquet.

### Pitfall 5: ecdysis.parquet Missing occurrenceID Column
**What goes wrong:** `links.parquet` output cannot map to `occurrenceID` because the input doesn't have it.
**Why it happens:** `occurrences.py::to_parquet()` deliberately drops `occurrenceID` (only keeps display columns).
**How to avoid:** Add `occurrenceID` to the columns selected in `to_parquet()`. It's already in the `dtype` dict as `pd.StringDtype()`.
**Warning signs:** `KeyError: 'occurrenceID'` when reading ecdysis.parquet in the links pipeline.

### Pitfall 6: HTML Cache Key Uses Wrong ID
**What goes wrong:** Cache files named by UUID (e.g. `e849dc52-...html`) but fetched by integer (5594056).
**Why it happens:** Inconsistency in what ID is used as cache key.
**How to avoid:** Cache file names use the integer `ecdysis_id` (consistent with URL parameter). The `occurrenceID` UUID is used only in the output parquet.
**Warning signs:** Second-level skip never fires because cache files have different names than expected.

## Code Examples

### Input File Reading
```python
# Source: follows inat/download.py pattern
import pandas as pd
from pathlib import Path

ECDYSIS_PARQUET = Path("ecdysis.parquet")  # run from data/ directory

df = pd.read_parquet(ECDYSIS_PARQUET, columns=['ecdysis_id', 'occurrenceID'])
# df has integer ecdysis_id (for URL) and string occurrenceID (for output)
```

### Output Schema
```python
result_df = pd.DataFrame({
    'occurrenceID': pd.array(occurrence_ids, dtype=pd.StringDtype()),
    'inat_observation_id': pd.array(obs_ids, dtype=pd.Int64Dtype()),
})
result_df.to_parquet(
    OUTPUT_PARQUET,
    index=False,
    compression='snappy',
    engine='pyarrow',
)
```

### npm Script Pattern (from package.json)
```json
"fetch-links": "cd data && uv run python -m links.fetch"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Script in data/scripts/ | Module in data/links/ | v1.3 | Testable, importable, consistent with inat/ pattern |
| requests.get() no headers | Add User-Agent header | Now | Fixes 403 from Ecdysis |
| occid=UUID | occid=ecdysis_id (integer) | Now | Fixes broken URL (was returning empty pages) |

**Deprecated/outdated:**
- `data/scripts/fetch_inat_links.py`: prototype only; do not extend — it has critical URL bug and wrong structure

## Open Questions

1. **Output file name: `links.parquet` or `ecdysis_inat_links.parquet`?**
   - What we know: requirements say `links.parquet`; prototype outputs `ecdysis_inat_links.parquet`
   - What's unclear: whether Phase 12 S3 cache scripts reference a specific name
   - Recommendation: Use `links.parquet` as specified in requirements

2. **Where does `links.parquet` live on disk?**
   - What we know: prototype uses `data/processed/links.parquet`; existing pipelines write to `data/samples.parquet`, `data/ecdysis.parquet` (top-level data/)
   - What's unclear: whether a `data/processed/` directory is conventional for this project (it doesn't exist yet)
   - Recommendation: Write to `data/links.parquet` (top-level, consistent with `samples.parquet` and `ecdysis.parquet`)

3. **Should `ecdysis/occurrences.py::to_parquet()` be updated in this phase or a pre-step?**
   - What we know: `ecdysis.parquet` currently lacks `occurrenceID`; this column must be added
   - Recommendation: Make it Wave 1 task 1 (update `to_parquet`, regenerate `ecdysis.parquet`) before writing the links pipeline

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | none (no pytest.ini; uses defaults) |
| Quick run command | `cd data && uv run pytest tests/test_links_fetch.py -q` |
| Full suite command | `cd data && uv run pytest tests/ -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LINK-01 | Fetches Ecdysis page at max 20 req/sec using integer ecdysis_id | unit (mock requests) | `uv run pytest tests/test_links_fetch.py::TestFetchPage -q` | Wave 0 |
| LINK-01 | Rate limiter does not sleep for cached/skipped records | unit | `uv run pytest tests/test_links_fetch.py::TestRateLimit -q` | Wave 0 |
| LINK-02 | First-level skip: skips occurrenceID already in links.parquet | unit | `uv run pytest tests/test_links_fetch.py::TestFirstLevelSkip -q` | Wave 0 |
| LINK-02 | Second-level skip: parses cached HTML without HTTP request | unit | `uv run pytest tests/test_links_fetch.py::TestSecondLevelSkip -q` | Wave 0 |
| LINK-03 | Extracts iNat ID from association-div anchor | unit | `uv run pytest tests/test_links_fetch.py::TestExtractObservationId -q` | Wave 0 |
| LINK-03 | Returns None when association-div absent | unit | `uv run pytest tests/test_links_fetch.py::TestExtractObservationId -q` | Wave 0 |
| LINK-04 | Output parquet has exactly two columns, correct dtypes | unit | `uv run pytest tests/test_links_fetch.py::TestOutput -q` | Wave 0 |
| LINK-04 | Output covers all occurrenceIDs (merge with existing) | unit | `uv run pytest tests/test_links_fetch.py::TestOutput -q` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_links_fetch.py -q`
- **Per wave merge:** `cd data && uv run pytest tests/ -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `data/tests/test_links_fetch.py` — covers all LINK-01 through LINK-04 behaviors
- [ ] `data/links/__init__.py` — empty module init
- [ ] `data/links/fetch.py` — main pipeline (created in Wave 1)

## Sources

### Primary (HIGH confidence)
- Live Ecdysis page verification — `https://ecdysis.org/collections/individual/index.php?occid=5594056&clid=0` fetched and parsed; association-div selector confirmed working; integer occid required
- `data/scripts/fetch_inat_links.py` — prototype analyzed in full; URL bug (UUID vs integer) documented
- `data/ecdysis/occurrences.py` — confirmed `occurrenceID` is in dtype map but dropped in `to_parquet()`
- `data/inat/download.py` — module structure pattern to follow
- `data/tests/test_inat_download.py` — test pattern to follow (mock-based unit tests)
- `data/pyproject.toml` — confirmed beautifulsoup4 and requests already declared

### Secondary (MEDIUM confidence)
- Ecdysis 403 behavior observed: plain requests.get() returns 403; browser User-Agent returns 200

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in pyproject.toml; verified against actual files
- Architecture: HIGH — URL bug and User-Agent requirement verified by live HTTP calls
- Pitfalls: HIGH — URL param bug, User-Agent, rate limit all verified empirically
- occurrenceID gap: HIGH — confirmed by reading ecdysis.parquet and occurrences.py source

**Research date:** 2026-03-11
**Valid until:** 2026-06-11 (Ecdysis HTML structure may change; re-verify selector if Symbiota version updates)
