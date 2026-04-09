---
status: partial
phase: 40-bee-table-component
source: [40-VERIFICATION.md]
started: 2026-04-07T22:35:00Z
updated: 2026-04-07T22:35:00Z
---

## Current Test

[awaiting human testing — run `cd frontend && npm run dev` then open http://localhost:5173]

## Tests

### UAT-40-01: Table layout and sticky header
**Steps:**
1. Open app, switch to Table view
2. Scroll through rows

**Expected:**
- Table fills available height with rows scrolling internally
- Column headers remain sticky at top during scroll
- Pagination bar anchored at bottom, does not scroll

**Status:** pending

---

### UAT-40-02: Row count with real data
**Steps:**
1. Open app in Table view with no filter applied
2. Observe row count indicator

**Expected:**
- Shows "Showing 1–100 of N specimens" (or samples) with accurate total N from DuckDB WASM

**Status:** pending

---

### UAT-40-03: Page navigation
**Steps:**
1. In Table view, click Next page
2. Click Previous page

**Expected:**
- Rows advance/retreat by 100
- Prev disabled on page 1, Next disabled on last page
- Row count indicator updates ("Showing 101–200 of N")

**Status:** pending

---

### UAT-40-04: Sort with URL persistence
**Steps:**
1. Click a column header (e.g., "Species")
2. Observe sort indicator arrow
3. Click again to reverse
4. Copy URL and reload page

**Expected:**
- Arrow appears on sorted column (↑ asc, ↓ desc)
- Sort direction toggles on second click
- URL round-trips — same sort state after reload

**Status:** pending

---

### UAT-40-05: Filter updates table
**Steps:**
1. Apply a genus filter in the sidebar
2. Observe table rows

**Expected:**
- Table rows update to match filtered data (same set as visible dots on map)
- Row count indicator reflects filtered total
- Page resets to 1

**Status:** pending

---

### UAT-40-06: Cell overflow tooltip
**Steps:**
1. Find a cell with truncated text (long species name, long county name)
2. Hover over the cell

**Expected:**
- Full text appears as tooltip (title attribute)
- Text truncated with ellipsis in cell

**Status:** pending

---

### UAT-40-07: Layer mode switch
**Steps:**
1. In Table view (specimens), switch layer mode to Samples
2. Observe columns

**Expected:**
- Column set changes from 7 specimen columns to 5 sample columns
- Data refreshes to show sample rows
- Row count updates

**Status:** pending
