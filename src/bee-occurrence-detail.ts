import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow, FilterState, FilterChangedEvent } from './filter.ts';
import { isSpecimenBacked, isProvisional, occIdFromRow } from './occurrence.ts';
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

function groupOccurrences(rows: OccurrenceRow[]): DateGroup[] {
  const dateMap = new Map<string, Map<string, CollectorGroup>>();
  for (const row of rows) {
    const date = row.date;
    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const collKey = row.recordedBy ?? '';
    const collMap = dateMap.get(date)!;
    if (!collMap.has(collKey)) {
      collMap.set(collKey, { date, recordedBy: row.recordedBy ?? '', rows: [] });
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
  // D-04: per-occurrence member-place names, resolved by the state owner
  // (<bee-atlas>) from the occurrence_places bridge and passed DOWN as a
  // property. Keyed on the synthetic occId (occIdFromRow). This presenter
  // ONLY reads this map — it never queries wa-sqlite itself (state-ownership
  // invariant, CLAUDE.md). Each value is a sorted, de-duplicated name array.
  @property({ attribute: false }) placeNames: Map<string, string[]> | null = null;

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
    .inat-missing {
      color: var(--text-hint);
      font-style: normal;
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
    .inat-id-label {
      font-size: 0.8rem;
      color: var(--text-body);
      font-weight: 400;
    }
    hr.separator {
      border: none;
      border-top: 1px solid var(--border-subtle);
      margin: 0.5rem 0;
    }
    .taxon-filter-link {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-style: dotted;
      color: inherit;
    }
    .taxon-filter-link:hover {
      text-decoration-style: solid;
    }
    .taxon-filter-link:focus-visible {
      text-decoration-style: solid;
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
    /* Per-record disclosure menu: spells out the outbound links/actions so the
       user reads labels instead of interpreting inline emoji-glyphs. Native
       <details>/<summary> so keyboard toggle + the disclosure-triangle affordance
       come for free (beeatlas-k7g). */
    .record-menu {
      display: inline-block;
      position: relative;
      vertical-align: baseline;
    }
    .record-menu > summary {
      list-style: none;
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 0.7rem;
      font-style: normal;
      line-height: 1;
      padding: 0 0.15em;
      user-select: none;
    }
    .record-menu > summary::-webkit-details-marker { display: none; }
    .record-menu > summary::marker { content: ''; }
    .record-menu > summary::after {
      content: '▾';
    }
    .record-menu[open] > summary { color: var(--text-body); }
    .record-menu > summary:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
    .menu-items {
      position: absolute;
      z-index: 10;
      /* Anchor to the trigger's right edge and open leftward: the disclosure
         triangle sits at the end of the row near the sidebar's right edge, so a
         left-anchored panel would overflow off-screen and clip its labels. */
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
    .menu-items a {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      font-style: normal;
      white-space: nowrap;
      text-decoration: none;
      color: var(--text-body);
    }
    .menu-items a:hover { background: var(--surface-hover); }
    .menu-items a:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
  `;

  // Keyboard activation for the role="button" taxon spans (WR-159-01): Enter/Space
  // trigger the element's own @click handler so we don't thread args through here.
  private _onTaxonKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  }

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

  private _renderHostInfo(row: OccurrenceRow) {
    const grade = row.inat_quality_grade;
    const badge = grade
      ? html`<span class="quality-badge ${grade}">${grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual'}</span>`
      : '';
    if (row.floralHost && row.inat_host && row.floralHost !== row.inat_host) {
      return html`<span class="host-conflict"><span class="host-label">ecdysis:</span> ${row.floralHost} · <span class="host-label">iNat:</span> ${row.inat_host}${badge}</span>`;
    }
    const host = row.floralHost ?? row.inat_host ?? null;
    return host ? html`${host}${badge}` : html`<span class="inat-missing">no host</span>${badge}`;
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
    if (row.specimen_observation_id != null) {
      items.push({ label: 'Specimen photo on iNaturalist', href: inatObs(row.specimen_observation_id) });
    }
    // Primary iNat observation of the sample/record itself (sample-only,
    // provisional, waba_specimen, inat_expert). observation_id and obs_url are
    // the two shapes this link takes across the arms; they never co-occur with
    // the specimen host/photo ids above.
    const obsLabel = isProvisional(row) ? 'WABA observation on iNaturalist' : 'Observation on iNaturalist';
    if (row.observation_id != null) {
      items.push({ label: obsLabel, href: inatObs(row.observation_id) });
    } else if (row.obs_url != null) {
      items.push({ label: obsLabel, href: row.obs_url });
    }
    return items;
  }

  // Presenter for the disclosure menu. Renders nothing when the record has no
  // links (e.g. checklist rows) — the ▾ handle only appears when it does something.
  private _renderMenu(items: { label: string; href: string }[]) {
    if (items.length === 0) return '';
    return html`
      <details class="record-menu">
        <summary aria-label="Links and actions" title="Links and actions"></summary>
        <div class="menu-items" role="menu">
          ${items.map(it => html`<a role="menuitem" href="${it.href}" target="_blank" rel="noopener">${it.label}</a>`)}
        </div>
      </details>
    `;
  }

  private _renderRecordMenu(row: OccurrenceRow) {
    return this._renderMenu(this._recordMenuItems(row));
  }

  private _renderCollectorGroup(group: CollectorGroup) {
    return html`
      <div class="sample">
        <div class="sample-header">${group.recordedBy || html`<span class="hint">unknown</span>`}</div>
        <ul class="species-list">
          ${group.rows.map(row => {
            const info = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
            const displayName = info?.name ?? null;
            return html`
            <li>
              ${displayName && row.taxon_id != null
                ? html`<span class="taxon-filter-link" role="button" tabindex="0" @keydown=${this._onTaxonKeydown} @click=${() => this._onTaxonClick(row.taxon_id!, displayName)}>${displayName}</span>`
                : html`<span class="no-determination">No determination</span>`
              }
              · ${this._renderHostInfo(row)}
              ${this._renderRecordMenu(row)}
              ${this._renderPlaceNames(row)}
            </li>
          `; })}
        </ul>
      </div>
    `;
  }

  private _renderDateGroup(group: DateGroup) {
    return html`
      <div class="date-group">
        <div class="date-header">${formatRomanDate(group.date)}</div>
        ${group.collectors.map(c => this._renderCollectorGroup(c))}
      </div>
    `;
  }

  private _renderSampleOnly(row: OccurrenceRow) {
    const count = row.specimen_count != null && !isNaN(row.specimen_count)
      ? `${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'} collected, identification pending`
      : 'identification pending';
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="event-date">${formatRomanDate(row.date)} ${this._renderRecordMenu(row)}</div>
        ${row.host_inat_login != null ? html`<div class="event-observer">${row.host_inat_login}</div>` : ''}
        ${row.sample_host != null ? html`<div class="event-host"><em>${row.sample_host}</em></div>` : ''}
        <div class="event-count">${count}</div>
        ${this._renderPlaceNames(row)}
      </div>
    `;
  }

  private _renderProvisional(row: OccurrenceRow) {
    const taxonEl = row.display_name && row.taxon_id != null
      ? html`<span class="taxon-filter-link" role="button" tabindex="0" @keydown=${this._onTaxonKeydown} @click=${() => this._onTaxonClick(row.taxon_id!, row.display_name!)}><em>${row.display_name}</em></span>`
      : row.display_name
        ? html`<em>${row.display_name}</em>`
        : html`<span class="hint">identification pending</span>`;
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="inat-id-label">iNat ID: ${taxonEl} ${this._renderQualityBadge(row.specimen_inat_quality_grade)} ${this._renderRecordMenu(row)}</div>
        <div class="event-date">${formatRomanDate(row.date)}</div>
        ${row.host_inat_login != null ? html`<div class="event-observer">${row.host_inat_login}</div>` : ''}
        ${row.specimen_count != null && !isNaN(row.specimen_count)
          ? html`<div class="event-count">${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'} collected</div>`
          : ''}
        ${this._renderPlaceNames(row)}
      </div>
    `;
  }

  private _renderWabaSpecimen(row: OccurrenceRow) {
    const inatInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
    const inatDisplayName = inatInfo?.name ?? row.display_name ?? null;
    const taxonEl = inatDisplayName && row.taxon_id != null
      ? html`<span class="taxon-filter-link" role="button" tabindex="0" @keydown=${this._onTaxonKeydown} @click=${() => this._onTaxonClick(row.taxon_id!, inatDisplayName)}><em>${inatDisplayName}</em></span>`
      : inatDisplayName
        ? html`<em>${inatDisplayName}</em>`
        : html`<span class="hint">identification unknown</span>`;
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="inat-id-label">${taxonEl} ${this._renderQualityBadge(row.specimen_inat_quality_grade)} ${this._renderRecordMenu(row)}</div>
        <div class="event-date">${formatRomanDate(row.date)}</div>
        ${row.user_login != null
          ? html`<div class="event-observer">${row.user_login}</div>` : ''}
        <div class="hint">Awaiting Ecdysis catalogue entry</div>
        ${this._renderPlaceNames(row)}
      </div>
    `;
  }

  private _renderInatObs(row: OccurrenceRow) {
    const isCC = row.license != null && row.license.toUpperCase().startsWith('CC');
    const inatInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
    const inatDisplayName = inatInfo?.name ?? null;
    const taxonEl = inatDisplayName && row.taxon_id != null
      ? html`<span class="taxon-filter-link" role="button" tabindex="0" @keydown=${this._onTaxonKeydown} @click=${() => this._onTaxonClick(row.taxon_id!, inatDisplayName)}><em>${inatDisplayName}</em></span>`
      : inatDisplayName
        ? html`<em>${inatDisplayName}</em>`
        : html`<span class="hint">identification unknown</span>`;
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="inat-id-label">${taxonEl} ${this._renderQualityBadge(row.inat_quality_grade)} ${this._renderRecordMenu(row)}</div>
        <div class="event-date">${formatRomanDate(row.date)}</div>
        ${row.user_login != null
          ? html`<div class="event-observer">${row.user_login}</div>` : ''}
        ${row.floralHost != null
          ? html`<div class="event-host"><em>${row.floralHost}</em></div>` : ''}
        ${isCC && row.image_url != null ? html`
          <img
            src="${row.image_url}"
            alt="Photo of ${inatDisplayName ?? 'bee'} by ${row.user_login ?? 'observer'} on iNaturalist"
            style="width:100%;max-height:200px;object-fit:cover;border-radius:4px;"
          />
        ` : ''}
        ${this._renderPlaceNames(row)}
      </div>
    `;
  }

  private _renderChecklist(row: OccurrenceRow) {
    const checklistInfo = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null;
    const accepted = checklistInfo?.name ?? null;
    const verbatim = row.verbatim_name;
    let taxonEl;
    if (accepted != null && verbatim != null && accepted !== verbatim) {
      taxonEl = html`<span class="taxon-filter-link" role="button" tabindex="0" @keydown=${this._onTaxonKeydown} @click=${() => this._onTaxonClick(row.taxon_id!, accepted)}><em>${accepted}</em></span> <span class="hint">(det. as ${verbatim})</span>`;
    } else if (accepted != null) {
      taxonEl = html`<span class="taxon-filter-link" role="button" tabindex="0" @keydown=${this._onTaxonKeydown} @click=${() => this._onTaxonClick(row.taxon_id!, accepted)}><em>${accepted}</em></span>`;
    } else if (verbatim != null) {
      taxonEl = html`<em>${verbatim}</em>`;
    } else {
      taxonEl = html`<span class="hint">No determination</span>`;
    }
    const dateStr = formatRomanDate(row.date);
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="inat-id-label">${taxonEl} ${this._renderRecordMenu(row)}</div>
        ${row.recordedBy != null ? html`<div class="event-observer">${row.recordedBy}</div>` : ''}
        ${dateStr ? html`<div class="event-date">${dateStr}</div>` : ''}
        ${row.locality != null && row.locality !== '' ? html`<div class="event-host">${row.locality}</div>` : ''}
        ${row.collapsed_count != null && row.collapsed_count > 1
          ? html`<div class="event-count">Represents ${row.collapsed_count} collapsed records</div>` : ''}
        <div class="hint">Bartholomew et al. 2024</div>
        ${this._renderPlaceNames(row)}
      </div>
    `;
  }

  // D-04: render the list of places this occurrence belongs to. Names come from
  // the passed-down placeNames map (state-owner-resolved); renders nothing when
  // the occurrence has no membership (zero rows → no sentinel).
  private _renderPlaceNames(row: OccurrenceRow) {
    const occId = occIdFromRow(row);
    if (occId == null || this.placeNames == null) return '';
    const names = this.placeNames.get(occId);
    if (names == null || names.length === 0) return '';
    return html`<div class="member-places">
      ${names.map(name => html`<span class="member-place">${name}</span>`)}
    </div>`;
  }

  render() {
    const specimenBacked = this.occurrences.filter(isSpecimenBacked);
    // nonSpecimen includes BOTH sample-only and provisional rows (!isSpecimenBacked, not the narrower predicate).
    // Null-safe: checklist rows with date_quality='none' carry date=null (Phase 138).
    // localeCompare on a null would throw and blank the whole card; null dates sort last.
    const nonSpecimen = this.occurrences.filter(r => !isSpecimenBacked(r))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const dateGroups = groupOccurrences(specimenBacked);
    return html`
      ${dateGroups.map(group => this._renderDateGroup(group))}
      ${dateGroups.length > 0 && nonSpecimen.length > 0
        ? html`<hr class="separator">` : ''}
      ${nonSpecimen.map(row =>
        // Phase 170 (D-09/D-10): the card is record_type-driven (orthogonal to tier — a 2-value
        // tier cannot pick the 5 card variants). isProvisional fires first (true for the
        // provisional_sample record_type). The `inat_obs` arm's record_type value is now
        // `inat_expert` (D-06); the occ_id prefix `inat_obs:` is unchanged (D-07).
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
