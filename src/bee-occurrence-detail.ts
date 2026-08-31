import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow, FilterState, FilterChangedEvent, MemberPlace } from './filter.ts';
import { isSpecimenBacked, isProvisional, occIdFromRow, collectorLabel } from './occurrence.ts';
import type { TaxonCacheEntry } from './taxa.ts';

const ROMAN_MONTHS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

export function formatRomanDate(dateStr: string | null): string {
  if (!dateStr) return '';
  if (dateStr.length === 10) {
    // YYYY-MM-DD full precision
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${ROMAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (dateStr.length === 7) {
    // YYYY-MM month precision
    const parts = dateStr.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    // WR-02 (defensive): an out-of-range/NaN month would index ROMAN_MONTHS out
    // of bounds and render "undefined YYYY". Live checklist data (ARM 4) never
    // hits this branch, but malformed iNat/sample substrings could. Fall back to
    // the raw string, consistent with the length-10 branch's isNaN guard.
    if (!Number.isInteger(month) || month < 1 || month > 12) return dateStr;
    return `${ROMAN_MONTHS[month - 1]} ${year}`;
  }
  if (dateStr.length === 4) {
    // YYYY year-only
    return dateStr;
  }
  return dateStr; // fallback: render as-is
}

interface CollectorGroup {
  date: string;
  recordedBy: string;
  rows: OccurrenceRow[];
}

interface DateGroup {
  date: string;
  collectors: CollectorGroup[];
}

function groupOccurrences(rows: OccurrenceRow[], names: ReadonlyMap<string, string> | null): DateGroup[] {
  const dateMap = new Map<string, Map<string, CollectorGroup>>();
  for (const row of rows) {
    const date = row.date;
    if (!dateMap.has(date)) dateMap.set(date, new Map());
    // Grouped on the SAME label the cards attribute to, so records by one person
    // land in one group whether the pipeline knew them by name or by iNat login.
    // Keying on recordedBy alone swept every login-only record into "unknown".
    const collKey = collectorLabel(row, names) ?? '';
    const collMap = dateMap.get(date)!;
    if (!collMap.has(collKey)) {
      collMap.set(collKey, { date, recordedBy: collKey, rows: [] });
    }
    collMap.get(collKey)!.rows.push(row);
  }
  return [...dateMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, collMap]) => ({
      date,
      collectors: [...collMap.values()].sort((a, b) => a.recordedBy.localeCompare(b.recordedBy)),
    }));
}

@customElement('bee-occurrence-detail')
export class BeeOccurrenceDetail extends LitElement {
  @property({ attribute: false }) occurrences: OccurrenceRow[] = [];
  @property({ attribute: false }) taxonCache: Map<number, TaxonCacheEntry> | null = null;
  @property({ attribute: false }) filterState: FilterState | null = null;
  // per-occurrence member places (slug + display name), resolved by the state
  // owner (<bee-atlas>) from the occurrence_places bridge and passed DOWN as a
  // property. Keyed on the synthetic occId (occIdFromRow). This presenter
  // ONLY reads this map — it never queries wa-sqlite itself (state-ownership
  // invariant, CLAUDE.md). Each value is sorted by name and de-duplicated.
  @property({ attribute: false }) memberPlaces: Map<string, MemberPlace[]> | null = null;

  // login -> display name, resolved by the state owner from the published
  // collector map (the same string that titles the person's collector page).
  // Null or missing simply means the '@login' fallback, so a card is never
  // blocked on this arriving — it is fetched after the DB is up, off the startup
  // path, and the attribution re-renders from handle to name when it lands.
  @property({ attribute: false }) collectorNames: ReadonlyMap<string, string> | null = null;

  static styles = css`
    :host {
      display: block;
    }
    .date-header {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-secondary);
      padding: 0.5rem 1rem 0.25rem;
      font-family: 'Times New Roman', 'Georgia', serif;
    }
    /* The shared location, riding the date line rather than sitting in a band of
       its own. Lighter than the date it follows so the date still leads. */
    .date-place {
      font-weight: 400;
      color: var(--text-hint);
    }
    .place-link {
      color: inherit;
      text-decoration: none;
    }
    .place-link:hover {
      color: var(--accent, #2c7a2c);
      text-decoration: underline;
    }
    .place-link:focus-visible {
      outline: 2px solid var(--accent, #2c7a2c);
      outline-offset: 2px;
      border-radius: 2px;
    }
    .sample {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sample-header {
      margin-bottom: 0.25rem;
      font-size: 0.9rem;
    }
    .species-list {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.85rem;
      font-style: italic;
    }
    .species-list li {
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .no-determination {
      font-style: normal;
      color: var(--text-hint);
    }
    .host-conflict {
      font-style: normal;
    }
    .host-label {
      color: var(--text-hint);
      font-size: 0.75rem;
    }
    .quality-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-style: normal;
      padding: 0 0.3em;
      border-radius: 3px;
      vertical-align: middle;
      margin-left: 0.4em;
    }
    .quality-badge.research {
      background: #d4edda;
      color: #155724;
    }
    .quality-badge.needs_id {
      background: #fff3cd;
      color: #856404;
    }
    .quality-badge.casual {
      background: #e2e3e5;
      color: #383d41;
    }
    .panel-content {
      padding: 1rem;
    }
    .sample-dot-detail {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .event-date {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-body);
      font-family: 'Times New Roman', 'Georgia', serif;
    }
    .event-observer {
      font-size: 0.8rem;
      color: var(--text-muted);
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .event-host {
      font-size: 0.8rem;
      color: var(--text-hint);
    }
    .event-count {
      font-size: 0.8rem;
      color: var(--text-hint);
    }
    .event-inat {
      font-size: 0.85rem;
    }
    .member-places {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.25rem;
    }
    .member-place {
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: var(--border-subtle);
      border-radius: 3px;
      padding: 0.05rem 0.35rem;
    }
    .hint {
      color: var(--text-hint);
      font-size: 0.85rem;
      font-style: italic;
    }
    /* The determination line of a record card: what this record says was found. */
    .record-determination {
      font-size: 0.8rem;
      color: var(--text-body);
      font-weight: 400;
    }
    /* "iNat ID:" — names where a determination came from, so it must not read as
       part of the name itself. */
    .det-source {
      color: var(--text-muted);
    }
    hr.separator {
      border: none;
      border-top: 1px solid var(--border-subtle);
      margin: 0.5rem 0;
    }
    /* Per-record disclosure menu: spells out the outbound links/actions so the
       user reads labels instead of interpreting inline emoji-glyphs. Native
       <details>/<summary> so keyboard toggle + the disclosure-triangle affordance
       come for free (beeatlas-k7g). */
    /* The ▼ handle floats to the right of the record's heading line, so it stays
       vertically aligned with that line regardless of the container's padding
       (position:absolute pinned it to the padded top edge, ~15px above the
       heading on the padded cards). position:relative keeps it the offset parent
       for the panel, which opens leftward from the sidebar's right edge. */
    .record-menu {
      position: relative;
      float: right;
      margin-left: 0.35rem;
    }
    .record-menu > summary {
      list-style: none;
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-style: normal;
      line-height: 1;
      padding: 0.1rem 0.2rem;
      user-select: none;
    }
    .record-menu > summary::-webkit-details-marker { display: none; }
    .record-menu > summary::marker { content: ''; }
    .record-menu > summary::after {
      content: '▼';
    }
    .record-menu > summary:hover,
    .record-menu[open] > summary { color: var(--text-body); }
    .record-menu > summary:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
    .menu-items {
      position: absolute;
      z-index: 10;
      /* Anchor to the handle's right edge (which sits at the container's right
         edge) and open leftward, staying inside the sidebar. */
      right: 0;
      top: 1.4em;
      display: flex;
      flex-direction: column;
      min-width: 12rem;
      padding: 0.25rem 0;
      background: #fff;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    .menu-items a,
    .menu-items button {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      font-style: normal;
      white-space: nowrap;
      text-decoration: none;
      color: var(--text-body);
    }
    /* Reset the <button> used for the in-app filter action so it matches the
       link items exactly. */
    .menu-items button {
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      font-family: inherit;
      cursor: pointer;
    }
    /* Separate the in-app action from the external links. */
    .menu-items .menu-action:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0.25rem;
      padding-bottom: 0.45rem;
    }
    .menu-items a:hover,
    .menu-items button:hover { background: var(--surface-hover); }
    .menu-items a:focus-visible,
    .menu-items button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._onDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocumentClick);
  }

  // A native <details> never closes on its own, so an open record menu would sit
  // there while the reader clicked elsewhere in the list — and a card can hold
  // many of them, so several could be open at once. Close every open menu the
  // click did not land inside. composedPath() pierces the shadow boundary, so a
  // click on a summary or on a menu item keeps that one menu open (the summary's
  // native toggle still does the closing there); a click anywhere else — another
  // record, the map, the page — closes them all.
  private _onDocumentClick = (e: Event) => {
    const open = this.renderRoot?.querySelectorAll?.('details.record-menu[open]');
    if (!open || open.length === 0) return;
    const path = e.composedPath();
    for (const details of open) {
      if (!path.includes(details)) (details as HTMLDetailsElement).open = false;
    }
  };

  private _onTaxonClick(taxonId: number, displayName: string) {
    if (!this.filterState) return;
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true,
      composed: true,
      detail: {
        taxonId,
        taxonDisplayName: displayName,
        yearFrom: this.filterState.yearFrom,
        yearTo: this.filterState.yearTo,
        months: this.filterState.months,
        selectedCounties: this.filterState.selectedCounties,
        selectedEcoregions: this.filterState.selectedEcoregions,
        selectedCollectors: this.filterState.selectedCollectors,
        elevMin: this.filterState.elevMin,
        elevMax: this.filterState.elevMax,
        selectedPlace: this.filterState.selectedPlace,
      } as FilterChangedEvent,
    }));
  }

  // The floral host and the quality badge that travels with it, including the
  // separator, so a species line can append it unconditionally.
  //
  // Renders NOTHING when there is no host. Most specimens have none, and a line
  // reading "Osmia lignaria · no host" spent its longest phrase saying nothing —
  // absence is already legible as absence. The badge still shows when the record
  // carries a grade but no host: it qualifies the observation, not the plant.
  private _renderHostInfo(row: OccurrenceRow) {
    const grade = row.inat_quality_grade;
    const badge = grade
      ? html`<span class="quality-badge ${grade}">${grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual'}</span>`
      : '';
    if (row.floralHost && row.inat_host && row.floralHost !== row.inat_host) {
      return html` · <span class="host-conflict"><span class="host-label">ecdysis:</span> ${row.floralHost} · <span class="host-label">iNat:</span> ${row.inat_host}${badge}</span>`;
    }
    const host = row.floralHost ?? row.inat_host ?? null;
    if (host) return html` · ${host}${badge}`;
    return grade ? html` ${badge}` : '';
  }

  private _renderQualityBadge(grade: string | null) {
    if (!grade) return '';
    const abbr = grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual';
    const fullLabel = grade === 'research' ? 'research grade' : grade === 'needs_id' ? 'needs ID' : 'casual';
    return html`<span class="quality-badge ${grade}" aria-label="${fullLabel}">${abbr}</span>`;
  }

  // Single source of truth for a record's outbound links (beeatlas-k7g). Every
  // card variant runs the SAME builder so occurrences present a consistent menu
  // regardless of tier or source — only the links the record actually has are
  // listed, each with a spelled-out label. record_type only sets the wording of
  // the primary iNat observation link (WABA vs plain).
  private _recordMenuItems(row: OccurrenceRow): { label: string; href: string }[] {
    const items: { label: string; href: string }[] = [];
    const inatObs = (id: number) => `https://www.inaturalist.org/observations/${id}`;
    if (row.ecdysis_id != null) {
      items.push({ label: 'Specimen on Ecdysis', href: `https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}` });
    }
    if (row.host_observation_id != null) {
      items.push({ label: 'Host plant on iNaturalist', href: inatObs(row.host_observation_id) });
    }
    // "Specimen photo" only for specimen-backed rows: there specimen_observation_id
    // is a photo of the collected specimen. For community observations (inat_expert,
    // waba_specimen) the SAME field holds the observation itself — identical to the
    // obs_url link below — so emitting it here would duplicate that link.
    if (isSpecimenBacked(row) && row.specimen_observation_id != null) {
      items.push({ label: 'Specimen photo on iNaturalist', href: inatObs(row.specimen_observation_id) });
    }
    // Primary iNat observation of the sample/record itself (sample-only,
    // provisional, waba_specimen, inat_expert). Specimen-backed rows are
    // EXCLUDED: their observation_id mirrors host_observation_id, so adding it
    // here would duplicate the "Host plant on iNaturalist" link above.
    if (!isSpecimenBacked(row)) {
      const obsLabel = isProvisional(row) ? 'WABA observation on iNaturalist' : 'Observation on iNaturalist';
      if (row.observation_id != null) {
        items.push({ label: obsLabel, href: inatObs(row.observation_id) });
      } else if (row.obs_url != null) {
        items.push({ label: obsLabel, href: row.obs_url });
      }
    }
    return items;
  }

  // Presenter for the disclosure menu. `filterTaxon`, when present, adds the
  // in-app "Filter for this species" action as a <button> above the external
  // links (this replaced the inline clickable species name). Renders nothing
  // when there is neither an action nor any link (e.g. checklist rows) — the ▼
  // handle only appears when it does something.
  private _renderMenu(
    items: { label: string; href: string }[],
    filterTaxon?: { taxonId: number; displayName: string },
  ) {
    if (items.length === 0 && filterTaxon == null) return '';
    // Deliberately NO ARIA menu roles: this is a disclosure of ordinary
    // tab-navigable links + one action button, not an ARIA menu widget (that
    // pattern would imply arrow-key/Home/End/Escape behavior we don't implement).
    // Native <a>/<button> semantics are the correct, accessible thing here.
    return html`
      <details class="record-menu">
        <summary aria-label="Links and actions" title="Links and actions"></summary>
        <div class="menu-items">
          ${filterTaxon != null ? html`
            <button type="button" class="menu-action"
              @click=${() => this._onTaxonClick(filterTaxon.taxonId, filterTaxon.displayName)}>
              Filter for this species
            </button>
          ` : ''}
          ${items.map(it => html`<a href="${it.href}" target="_blank" rel="noopener">${it.label}</a>`)}
        </div>
      </details>
    `;
  }

  // Build the optional filter action for a row: present only when the row has a
  // determined taxon (taxon_id) AND a resolved display name to label the filter.
  private _filterTaxon(taxonId: number | null, displayName: string | null) {
    return taxonId != null && displayName != null ? { taxonId, displayName } : undefined;
  }

  private _renderRecordMenu(
    row: OccurrenceRow,
    filterTaxon?: { taxonId: number; displayName: string },
  ) {
    return this._renderMenu(this._recordMenuItems(row), filterTaxon);
  }

  private _renderCollectorGroup(group: CollectorGroup, shared: MemberPlace[]) {
    return html`
      <div class="sample">
        <div class="sample-header">${group.recordedBy || html`<span class="hint">unknown</span>`}</div>
        <ul class="species-list">
          ${group.rows.map(row => {
            const info = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
            const displayName = info?.name ?? null;
            return html`
            <li>
              ${displayName != null
                ? html`<span class="taxon-name">${displayName}</span>`
                : html`<span class="no-determination">No determination</span>`
              }${this._renderHostInfo(row)}
              ${this._renderRecordMenu(row, this._filterTaxon(row.taxon_id, displayName))}
              ${this._renderPlaceNames(row, shared)}
            </li>
          `; })}
        </ul>
      </div>
    `;
  }

  private _renderDateGroup(group: DateGroup) {
    // Scoped to THIS group, not to the whole list: a date group is what the date
    // line heads, so it is what the line may speak for. A list spanning two
    // ecoregions shares nothing overall, but each of its groups still sits in
    // one place, and that is worth saying once per group rather than per record.
    const shared = this._sharedPlaces(group.collectors.flatMap(c => c.rows));
    return html`
      <div class="date-group">
        <div class="date-header">${formatRomanDate(group.date)}${this._renderPlaceInline(shared)}</div>
        ${group.collectors.map(c => this._renderCollectorGroup(c, shared))}
      </div>
    `;
  }

  /**
   * The one card every non-specimen record renders through.
   *
   * There used to be five of these — sample-only, provisional, awaiting-catalogue,
   * community observation, checklist — each free to order its own lines, and they
   * had drifted: three led with the determination, two with the date. Order is a
   * property of the CARD, not of the record type, so it lives here once and the
   * variants below say only what goes in each slot.
   *
   * The order is context first, the way the specimen path already read: WHEN and
   * WHERE, then WHO, then WHAT was found, then whatever qualifies it. A record's
   * identity is the collecting event; the determination is a claim about that
   * event, and one that can change without the event changing.
   */
  private _renderRecordCard(row: OccurrenceRow, card: {
    /** The determination line: the taxon as this record states it, plus its badge. */
    determination: unknown;
    /** Who: collector, observer, or sample host, depending on the record's source. */
    attribution: string | null;
    /** Anything qualifying the record — host plant, counts, locality, photo, provenance. */
    extras?: unknown[];
    filterTaxon?: { taxonId: number; displayName: string };
  }) {
    // A standalone card is its own group, so every place it belongs to is shared
    // by definition and rides the date line — a lone card never shows chips.
    const places = this._sharedPlaces([row]);
    const dateStr = formatRomanDate(row.date);
    return html`
      <div class="panel-content sample-dot-detail">
        ${dateStr || places.length > 0
          ? html`<div class="event-date">${dateStr}${this._renderPlaceInline(places)}</div>` : ''}
        ${card.attribution != null && card.attribution !== ''
          ? html`<div class="event-observer">${card.attribution}</div>` : ''}
        <div class="record-determination">${card.determination} ${this._renderRecordMenu(row, card.filterTaxon)}</div>
        ${(card.extras ?? []).filter(extra => extra !== '' && extra != null)}
      </div>
    `;
  }

  /** "12 specimens collected" — the count only, never the determination status. */
  private _renderSpecimenCount(row: OccurrenceRow) {
    if (row.specimen_count == null || isNaN(row.specimen_count)) return '';
    return html`<div class="event-count">${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'} collected</div>`;
  }

  private _renderSampleOnly(row: OccurrenceRow) {
    return this._renderRecordCard(row, {
      attribution: collectorLabel(row, this.collectorNames),
      determination: html`<span class="hint">Identification pending</span>`,
      extras: [
        row.sample_host != null ? html`<div class="event-host"><em>${row.sample_host}</em></div>` : '',
        this._renderSpecimenCount(row),
      ],
    });
  }

  private _renderProvisional(row: OccurrenceRow) {
    const taxonEl = row.display_name
      ? html`<em>${row.display_name}</em>`
      : html`<span class="hint">identification pending</span>`;
    return this._renderRecordCard(row, {
      attribution: collectorLabel(row, this.collectorNames),
      // "iNat ID:" is load-bearing: this determination came from iNaturalist and
      // has no Ecdysis specimen behind it yet.
      determination: html`<span class="det-source">iNat ID:</span> ${taxonEl} ${this._renderQualityBadge(row.specimen_inat_quality_grade)}`,
      filterTaxon: this._filterTaxon(row.taxon_id, row.display_name),
      extras: [this._renderSpecimenCount(row)],
    });
  }

  private _renderWabaSpecimen(row: OccurrenceRow) {
    const inatInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
    const inatDisplayName = inatInfo?.name ?? row.display_name ?? null;
    const taxonEl = inatDisplayName
      ? html`<em>${inatDisplayName}</em>`
      : html`<span class="hint">identification unknown</span>`;
    return this._renderRecordCard(row, {
      attribution: collectorLabel(row, this.collectorNames),
      determination: html`${taxonEl} ${this._renderQualityBadge(row.specimen_inat_quality_grade)}`,
      filterTaxon: this._filterTaxon(row.taxon_id, inatDisplayName),
      extras: [html`<div class="hint">Awaiting Ecdysis catalogue entry</div>`],
    });
  }

  private _renderInatObs(row: OccurrenceRow) {
    const isCC = row.license != null && row.license.toUpperCase().startsWith('CC');
    const inatInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
    const inatDisplayName = inatInfo?.name ?? null;
    const taxonEl = inatDisplayName
      ? html`<em>${inatDisplayName}</em>`
      : html`<span class="hint">identification unknown</span>`;
    return this._renderRecordCard(row, {
      attribution: collectorLabel(row, this.collectorNames),
      determination: html`${taxonEl} ${this._renderQualityBadge(row.inat_quality_grade)}`,
      filterTaxon: this._filterTaxon(row.taxon_id, inatDisplayName),
      extras: [
        row.floralHost != null ? html`<div class="event-host"><em>${row.floralHost}</em></div>` : '',
        // Only a CC licence lets the photo be shown at all; everything else links out.
        isCC && row.image_url != null ? html`
          <img
            src="${row.image_url}"
            alt="Photo of ${inatDisplayName ?? 'bee'} by ${row.user_login ?? 'observer'} on iNaturalist"
            style="width:100%;max-height:200px;object-fit:cover;border-radius:4px;"
          />
        ` : '',
      ],
    });
  }

  private _renderChecklist(row: OccurrenceRow) {
    const checklistInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
    const accepted = checklistInfo?.name ?? null;
    const verbatim = row.verbatim_name;
    let taxonEl;
    if (accepted != null && verbatim != null && accepted !== verbatim) {
      taxonEl = html`<em>${accepted}</em> <span class="hint">(det. as ${verbatim})</span>`;
    } else if (accepted != null) {
      taxonEl = html`<em>${accepted}</em>`;
    } else if (verbatim != null) {
      taxonEl = html`<em>${verbatim}</em>`;
    } else {
      taxonEl = html`<span class="hint">No determination</span>`;
    }
    return this._renderRecordCard(row, {
      attribution: collectorLabel(row, this.collectorNames),
      determination: taxonEl,
      filterTaxon: this._filterTaxon(row.taxon_id, accepted),
      extras: [
        row.locality != null && row.locality !== '' ? html`<div class="event-host">${row.locality}</div>` : '',
        row.collapsed_count != null && row.collapsed_count > 1
          ? html`<div class="event-count">Represents ${row.collapsed_count} collapsed records</div>` : '',
        html`<div class="hint">Bartholomew et al. 2024</div>`,
      ],
    });
  }
  /**
   * The places shared by every row in a group — the intersection of their
   * memberships, keyed on slug because two places could share a name.
   *
   * Level IV ecoregions are places (ADR 0035) and they tile the state, so every
   * occurrence carries one; without this the same ecoregion repeats on every
   * species line of a single point. It is computed per GROUP rather than per
   * list: a date line speaks for the records under it and no further.
   *
   * Deliberately conservative: one row whose membership is unresolved or empty
   * collapses the intersection, so a date line never claims a place that some
   * record beneath it is not in — those rows keep their own chips instead.
   */
  private _sharedPlaces(rows: OccurrenceRow[]): MemberPlace[] {
    if (this.memberPlaces == null) return [];
    let shared: MemberPlace[] | null = null;
    for (const row of rows) {
      const occId = occIdFromRow(row);
      // Identity-less rows carry no membership and render no chips, so they
      // neither contribute to nor collapse the shared set.
      if (occId == null) continue;
      const places = this.memberPlaces.get(occId);
      if (places == null || places.length === 0) return [];
      if (shared == null) { shared = [...places]; continue; }
      const slugs = new Set(places.map(p => p.slug));
      shared = shared.filter(p => slugs.has(p.slug));
      if (shared.length === 0) return shared;
    }
    return shared ?? [];
  }

  // A place name as a link to its page (/places/<slug>.html — sites and Level IV
  // ecoregions both live there, ADR 0035). Same tab, like the header's search
  // results: these are pages of this site, not outbound links.
  private _renderPlaceLink(place: MemberPlace) {
    return html`<a class="place-link" href="/places/${place.slug}.html">${place.name}</a>`;
  }

  // Places as an inline continuation of a date line. Empty in, nothing out — so
  // a date line with nothing to say is left exactly as it was.
  private _renderPlaceInline(places: MemberPlace[]) {
    if (places.length === 0) return '';
    return html` <span class="date-place">— ${places.map((place, i) =>
      html`${i > 0 ? ' · ' : ''}${this._renderPlaceLink(place)}`)}</span>`;
  }

  // The places this occurrence belongs to that its date line does NOT already
  // name. Renders nothing when the occurrence has no membership (zero bridge
  // rows → no sentinel) or when everything it has is shared by its group.
  private _renderPlaceNames(row: OccurrenceRow, shared: MemberPlace[]) {
    const occId = occIdFromRow(row);
    if (occId == null || this.memberPlaces == null) return '';
    const onDateLine = new Set(shared.map(p => p.slug));
    const places = this.memberPlaces.get(occId)?.filter(p => !onDateLine.has(p.slug));
    if (places == null || places.length === 0) return '';
    return html`<div class="member-places">
      ${places.map(place => html`<span class="member-place">${this._renderPlaceLink(place)}</span>`)}
    </div>`;
  }

  render() {
    const specimenBacked = this.occurrences.filter(isSpecimenBacked);
    // nonSpecimen includes BOTH sample-only and provisional rows (!isSpecimenBacked, not the narrower predicate).
    // Null-safe: checklist rows with date_quality='none' carry date=null.
    // localeCompare on a null would throw and blank the whole card; null dates sort last.
    const nonSpecimen = this.occurrences.filter(r => !isSpecimenBacked(r))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const dateGroups = groupOccurrences(specimenBacked, this.collectorNames);
    return html`
      ${dateGroups.map(group => this._renderDateGroup(group))}
      ${dateGroups.length > 0 && nonSpecimen.length > 0
        ? html`<hr class="separator">` : ''}
      ${nonSpecimen.map(row =>
        // the card is record_type-driven (orthogonal to tier — a 2-value
        // tier cannot pick the 5 card variants). isProvisional fires first (true for the
        // provisional_sample record_type). The `inat_obs` arm's record_type value is now
        // `inat_expert`; the occ_id prefix `inat_obs:` is unchanged.
        isProvisional(row)
          ? this._renderProvisional(row)
          : row.record_type === 'checklist'
            ? this._renderChecklist(row)
            : row.record_type === 'waba_specimen'
              ? this._renderWabaSpecimen(row)
              : row.record_type === 'inat_expert'
                ? this._renderInatObs(row)
                : this._renderSampleOnly(row)
      )}
    `;
  }
}
