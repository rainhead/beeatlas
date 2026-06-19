// Vite entry for the /app route.
// Imports <bee-atlas> (same component as /) plus SW registration.
// _pages/index.html references src/bee-atlas.ts directly and MUST NOT
// import this file — that structural separation is the no-SW-on-/ guarantee.
//
// Prime orchestrator (CACHE-01/02/04 in Phase 150) is imported as a side-effect module —
// it owns the cold-start cache prime + cache probe + 'online' re-prime listener.
// See prime-orchestrator.ts and CONTEXT D-02 (Phase 150-03).
import './bee-atlas.ts';
import './sw-registration.ts';
import './prime-orchestrator.ts';
