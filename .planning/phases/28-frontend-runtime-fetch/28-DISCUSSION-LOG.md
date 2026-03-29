# Phase 28: Frontend Runtime Fetch — Discussion Log

**Date:** 2026-03-29
**Mode:** discuss

---

## Areas Discussed

All four areas selected by user.

---

### URL Configuration

**Q: How should the frontend know where to fetch data files from?**
Selected: Same-origin /data/ path
→ Refined in follow-up: user wants to load *directly from CloudFront* (absolute URL) to maximize browser cache reuse across environments. Same-origin path wouldn't work in dev.

**Q: For local dev, how should data files be served?**
User response: "Load directly from cloudfront unless overridden, so maximize use of browser cache."
→ Decision: use absolute `https://beeatlas.net/data/` URL with optional `VITE_DATA_BASE_URL` override. No proxy.

---

### GeoJSON Migration

**Q: How should GeoJSON be loaded?**
Selected: OL VectorSource url + format (Recommended)
→ OL handles fetch internally. Clean and consistent with OL patterns.

**Q: Remove geojsonPlugin from vite.config.ts?**
Selected: Yes, remove it (Recommended)

---

### Loading UX

User interrupted AskUserQuestion with note: "The nature of loading, among many other things, will need to be thought through more carefully when we move to clientside DuckDB. Right now I'm mostly looking for rough feature parity."
→ Decision: minimal loading state, deferred UX redesign to DuckDB WASM phase.

---

### Error Handling

**Q: If a data file fetch fails, what should the frontend show?**
Selected: Simple error message, no map (Recommended)
→ "Failed to load data. Please try refreshing."
