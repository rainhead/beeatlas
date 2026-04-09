---
phase: quick-260408-tvl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/bee-filter-controls.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "When input is focused and empty, up to 5 recently used tokens appear as suggestions"
    - "Selecting a recent suggestion adds the token exactly like a normal suggestion"
    - "Each time a token is added via _selectSuggestion, that token is saved to localStorage history"
    - "Recent history persists across page refreshes (localStorage)"
    - "Tokens already active in _tokens are excluded from recents list"
  artifacts:
    - path: "frontend/src/bee-filter-controls.ts"
      provides: "Recent filters feature: localStorage persistence + empty-input suggestions"
  key_links:
    - from: "_onFocus / _onInput"
      to: "_suggestions"
      via: "getRecentSuggestions() called when inputText is empty"
    - from: "_selectSuggestion"
      to: "localStorage beeatlas.recentFilters"
      via: "saveRecentToken(token) appended after selection"
---

<objective>
When the filter input is focused and empty, show up to 5 recently used filter tokens as dropdown suggestions. Recents are saved to localStorage on each token selection and excluded if the token type/value conflicts with an already-active token.

Purpose: Lets users quickly re-apply filters they used in previous sessions without retyping.
Output: Modified bee-filter-controls.ts with localStorage persistence and empty-input suggestion path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@frontend/src/bee-filter-controls.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add localStorage helpers and recent-token suggestion logic</name>
  <files>frontend/src/bee-filter-controls.ts</files>
  <action>
Add two module-level helpers below the existing `getSuggestions` function:

```typescript
const RECENTS_KEY = 'beeatlas.recentFilters';
const RECENTS_MAX = 10;

function loadRecentTokens(): Token[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as Token[]) : [];
  } catch {
    return [];
  }
}

function saveRecentToken(token: Token): void {
  const existing = loadRecentTokens();
  // Deduplicate: remove any existing entry for same token identity
  const filtered = existing.filter(t => JSON.stringify(t) !== JSON.stringify(token));
  const next = [token, ...filtered].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded — ignore
  }
}

function getRecentSuggestions(tokens: Token[]): Suggestion[] {
  const recents = loadRecentTokens();
  const results: Suggestion[] = [];
  const activeTypes = new Set(tokens.map(t => t.type));

  for (const t of recents) {
    // Skip if this exact token is already active
    if (tokens.some(a => JSON.stringify(a) === JSON.stringify(t))) continue;
    // Skip single-slot dimensions that are already filled
    if (t.type === 'taxon' && activeTypes.has('taxon')) continue;
    if ((t.type === 'yearFrom' || t.type === 'yearExact') &&
        (activeTypes.has('yearFrom') || activeTypes.has('yearExact'))) continue;
    if ((t.type === 'yearTo' || t.type === 'yearExact') &&
        (activeTypes.has('yearTo') || activeTypes.has('yearExact'))) continue;
    results.push({ label: tokenLabel(t), token: t });
    if (results.length >= 5) break;
  }
  return results;
}
```

Then make two targeted changes to the class:

1. In `_onInput`, change the empty-input branch so it shows recents instead of nothing:
   Replace:
   ```typescript
   this._suggestions = getSuggestions(value, ...);
   this._open = this._suggestions.length > 0;
   ```
   With:
   ```typescript
   if (value === '') {
     this._suggestions = getRecentSuggestions(this._tokens);
   } else {
     this._suggestions = getSuggestions(value, this.taxaOptions, this.countyOptions, this.ecoregionOptions, this.collectorOptions, this._tokens);
   }
   this._open = this._suggestions.length > 0;
   ```

2. Add an `_onFocus` handler on the input that opens recents when the input is empty:
   ```typescript
   private _onFocus() {
     if (this._inputText === '') {
       this._suggestions = getRecentSuggestions(this._tokens);
       this._open = this._suggestions.length > 0;
     }
   }
   ```
   Wire it in the render template: `@focus=${this._onFocus}` on the `<input>`.

3. In `_selectSuggestion`, call `saveRecentToken(s.token)` immediately after the `next.push(s.token)` line (before `_emitTokens`).
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npm run build 2>&1 | tail -20</automated>
  </verify>
  <done>
    TypeScript build passes with no errors. When the filter input is focused while empty, previously selected tokens appear as suggestions in the dropdown. Selecting one adds it as a token. The token is persisted to localStorage under "beeatlas.recentFilters".
  </done>
</task>

</tasks>

<verification>
Manual smoke test:
1. Open the app, type "Bombus" in the filter input and select a taxon suggestion.
2. Clear all filters.
3. Click the filter input without typing — the taxon you just selected should appear as a recent suggestion.
4. Refresh the page, click the empty filter input — the recent should still appear (localStorage persisted).
5. Add the taxon token, then click the empty input again — the taxon recent should be absent (already active).
</verification>

<success_criteria>
- Build passes with no TypeScript errors.
- Recents dropdown appears on focus when input is empty.
- Recents exclude already-active tokens and filled single-slot dimensions.
- Selections are persisted to localStorage and survive page refresh.
- Up to 5 recents shown, capped at 10 stored.
</success_criteria>

<output>
After completion, create `.planning/quick/260408-tvl-show-recent-filters-when-filter-input-is/260408-tvl-SUMMARY.md`
</output>
