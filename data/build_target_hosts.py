"""Build the WA-native target-host seed from the Burke Washington Flora Checklist.

Target hosts (prospective; see CONTEXT.md "Target host") are plants volunteers are
directed to *seek out*. This builds the WA-native/endemic arm from the Burke
"Washington Flora Checklist" — the Fowler specialist-host and project-leader arms
are separate sources unified downstream.

Data-use permission for the Washington Flora Checklist was granted by David Giblin
(UW Herbarium / WTU) on 2026-07-06 (bd issue beeatlas-zgo; memory
wtu-herbarium-data-permission). Attribution requirement: cite the "Washington
Flora Checklist" wherever this data is surfaced.

Pipeline (license-clean, deterministic, no live iNat API calls):
  1. Download WAFloraChecklist.zip (Burke regenerates it; WA flora is stable, so a
     committed seed snapshot — like bee_specialist_hosts.csv — beats a live source).
  2. Filter waflora.txt to native terminal angiosperms (TerminalTaxon='Y',
     Origin 'Native%', InformalClassification Dicots|Monocots).
  3. Roll up infraspecific taxa (var./ssp.) to binomial species — bees forage at
     the species/genus level, and iNat carries the species even where it lacks the
     variety (93% species match vs 66% at the infraspecific level).
  4. Reconcile each species to an iNat taxon_id against the local iNat backbone
     (raw/taxa.csv.gz), with Burke synonymy.txt and a curated-override seed
     (target_hosts_overrides.csv) as fallbacks for genus-reassignment synonyms
     (e.g. Burke Mahonia -> iNat Berberis).
  5. Write the committed seed dbt/seeds/target_hosts.csv (resolved rows, keyed on
     inat_taxon_id) and a dbt/seeds/target_hosts_unresolved.csv sidecar (tracked,
     never silently dropped — the curation queue for target_hosts_overrides.csv).

Run (needs network + raw/taxa.csv.gz present): cd data && uv run python build_target_hosts.py
"""

import io
import zipfile
from pathlib import Path

import duckdb
import requests

BURKE_ZIP_URL = "https://burkeherbarium.org/waflora/data/WAFloraChecklist.zip"
BURKE_HEADERS = {"User-Agent": "BeeAtlas/1.0 (https://github.com/rainhead/beeatlas; data curation)"}

DATA_DIR = Path(__file__).parent
RAW_TAXA = DATA_DIR / "raw" / "taxa.csv.gz"
CACHE_DIR = Path(".burke_cache")

# target_hosts.csv is the dbt seed (loaded into the warehouse). The override input
# and the unresolved sidecar live under data/curation/ so dbt (which loads every
# CSV under seeds/) does NOT pick them up — they are curation artifacts, not models.
SEED_PATH = DATA_DIR / "dbt" / "seeds" / "target_hosts.csv"
CURATION_DIR = DATA_DIR / "curation"
UNRESOLVED_PATH = CURATION_DIR / "target_hosts_unresolved.csv"
OVERRIDES_PATH = CURATION_DIR / "target_hosts_overrides.csv"

# Angiosperm classes in Burke's InformalClassification. Ferns/Lycophytes and
# Gymnosperms are excluded — they are not bee-pollinated flowering plants.
ANGIOSPERM_CLASSES = ("Vascular Plants: Dicots", "Vascular Plants: Monocots")


def _download_burke() -> Path:
    """Download and extract the Burke checklist TSVs into CACHE_DIR; return the dir."""
    CACHE_DIR.mkdir(exist_ok=True)
    if (CACHE_DIR / "waflora.txt").exists() and (CACHE_DIR / "synonymy.txt").exists():
        print(f"  Using cached Burke checklist in {CACHE_DIR}")  # noqa: T201
        return CACHE_DIR
    print(f"  Downloading {BURKE_ZIP_URL} ...")  # noqa: T201
    r = requests.get(BURKE_ZIP_URL, headers=BURKE_HEADERS, timeout=120)
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        zf.extractall(CACHE_DIR)
    return CACHE_DIR


def build() -> None:
    if not RAW_TAXA.exists():
        raise FileNotFoundError(
            f"{RAW_TAXA} not found — the iNat backbone is required for taxon_id "
            "reconciliation. On maderas it is pulled from S3 by the nightly; locally "
            "run the taxa-download pipeline step first."
        )
    burke = _download_burke()
    con = duckdb.connect()

    # iNat backbone: active-taxon name -> taxon_id. lower/trim for case-insensitive join.
    con.execute(
        "CREATE VIEW inat AS SELECT lower(trim(name)) AS nm, taxon_id, name AS inat_name "
        "FROM read_csv(?, delim=chr(9), header=true, all_varchar=true) "
        "WHERE lower(active) IN ('t','true')",
        [str(RAW_TAXA)],
    )
    con.execute(
        "CREATE VIEW waflora AS SELECT * FROM read_csv(?, delim=chr(9), header=true, "
        "all_varchar=true, ignore_errors=true)",
        [str(burke / "waflora.txt")],
    )
    con.execute(
        "CREATE VIEW synonymy AS SELECT * FROM read_csv(?, delim=chr(9), header=true, "
        "all_varchar=true, ignore_errors=true)",
        [str(burke / "synonymy.txt")],
    )
    # Curated overrides: canonical_name (Burke binomial) -> inat_taxon_id, for the
    # genus-reassignment tail. May be header-only.
    con.execute(
        "CREATE VIEW overrides AS SELECT lower(trim(canonical_name)) AS nm, "
        "CAST(inat_taxon_id AS VARCHAR) AS taxon_id "
        "FROM read_csv(?, header=true, all_varchar=true)",
        [str(OVERRIDES_PATH)],
    )

    # Native terminal angiosperms, rolled up to binomial species. `endemic` is Y if
    # ANY contributing Burke taxon (species or its infraspecifics) is WA-endemic.
    con.execute(
        f"""
        CREATE TABLE species AS
        SELECT
            lower(regexp_extract(trim(TaxonName), '^([A-Za-z-]+ [A-Za-z-]+)', 1)) AS binomial,
            any_value(Family)                    AS family,
            MAX(CASE WHEN Endemic = 'Y' THEN 'Y' ELSE 'N' END) AS endemic,
            MIN(TaxonID)                         AS burke_taxon_id
        FROM waflora
        WHERE TerminalTaxon = 'Y'
          AND Origin LIKE 'Native%'
          AND InformalClassification IN ({','.join('?' for _ in ANGIOSPERM_CLASSES)})
          AND regexp_extract(trim(TaxonName), '^([A-Za-z-]+ [A-Za-z-]+)', 1) <> ''
        GROUP BY 1
        """,
        list(ANGIOSPERM_CLASSES),
    )

    # Reconcile: (1) direct name match, (2) Burke synonymy — a synonym ScientificName
    # of the same accepted Burke TaxonID that IS an iNat active name, (3) curated override.
    con.execute(
        """
        CREATE TABLE resolved AS
        WITH direct AS (
            SELECT s.binomial, s.family, s.endemic, i.taxon_id, i.inat_name
            FROM species s JOIN inat i ON i.nm = s.binomial
        ),
        via_syn AS (
            SELECT s.binomial, s.family, s.endemic,
                   arg_min(i.taxon_id, i.nm) AS taxon_id, arg_min(i.inat_name, i.nm) AS inat_name
            FROM species s
            JOIN synonymy sy ON sy.TaxonID = s.burke_taxon_id AND lower(sy.NameStatus) = 'synonym'
            JOIN inat i ON i.nm = lower(trim(sy.ScientificName))
            WHERE s.binomial NOT IN (SELECT binomial FROM direct)
            GROUP BY s.binomial, s.family, s.endemic
        ),
        via_override AS (
            SELECT s.binomial, s.family, s.endemic, i.taxon_id, i.inat_name
            FROM species s
            JOIN overrides o ON o.nm = s.binomial
            JOIN inat i ON CAST(i.taxon_id AS VARCHAR) = o.taxon_id
            WHERE s.binomial NOT IN (SELECT binomial FROM direct)
              AND s.binomial NOT IN (SELECT binomial FROM via_syn)
        )
        SELECT * FROM direct
        UNION ALL SELECT * FROM via_syn
        UNION ALL SELECT * FROM via_override
        """
    )

    con.execute(
        f"""
        COPY (
            SELECT inat_name AS canonical_name, family, CAST(taxon_id AS BIGINT) AS inat_taxon_id,
                   endemic, 'burke-wa-flora' AS source
            FROM resolved
            -- Two Burke binomials can reconcile to one iNat taxon (iNat lumps them);
            -- keep one row per taxon_id so the seed's unique(inat_taxon_id) test holds.
            -- Prefer an endemic-flagged row, then the alphabetically-first name.
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY taxon_id ORDER BY (endemic = 'Y') DESC, inat_name
            ) = 1
            ORDER BY canonical_name
        ) TO '{SEED_PATH}' (FORMAT CSV, HEADER true, QUOTE '"', FORCE_QUOTE (canonical_name, family))
        """
    )
    con.execute(
        f"""
        COPY (
            SELECT binomial AS canonical_name, family, endemic
            FROM species
            WHERE binomial NOT IN (SELECT binomial FROM resolved)
            ORDER BY canonical_name
        ) TO '{UNRESOLVED_PATH}' (FORMAT CSV, HEADER true, QUOTE '"', FORCE_QUOTE (canonical_name, family))
        """
    )

    total = con.execute("SELECT count(*) FROM species").fetchone()[0]
    resolved = con.execute("SELECT count(*) FROM resolved").fetchone()[0]
    endemic = con.execute("SELECT count(*) FROM resolved WHERE endemic='Y'").fetchone()[0]
    print(f"  target_hosts.csv: {resolved}/{total} native angiosperm species resolved "  # noqa: T201
          f"({100 * resolved // total}%), {endemic} WA-endemic")
    print(f"  target_hosts_unresolved.csv: {total - resolved} species pending override")  # noqa: T201
    con.close()


if __name__ == "__main__":
    build()
