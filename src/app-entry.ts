// The app's Vite entry, and the ONLY one that registers a service worker or starts
// the data prime. `_pages/index.html` is the only template that references it.
//
// That is LOAD-BEARING as of ADR 0029, not incidental. The static pages mount through
// src/entries/{bee-header,species-index,taxon-page}.ts, none of which import this file
// or anything it pulls in — which is what keeps a 3.3 MB precache and a ~34.8 MB prime
// off a species page that loads 18 KB of JavaScript. Adding an import of this module
// to a static page's entry hands both to a reader who never opened the map.
//
// Prime orchestrator (CACHE-01/02/04 in Phase 150) is imported as a side-effect module —
// it owns the cold-start cache prime + cache probe + 'online' re-prime listener.
// See prime-orchestrator.ts and CONTEXT D-02 (Phase 150-03).
// FIRST: module side effects run in import order, and some modules fetch as they
// initialise. Wrapping fetch after them would miss exactly the requests we are
// hunting (beeatlas-c8v).
import './net-log.ts';
import './bee-atlas.ts';
import './sw-registration.ts';
import './prime-orchestrator.ts';
import './install-prompt.ts';
// `?diag=1` only — inert otherwise. It exists because the device where the
// offline failures actually happen (a phone, installed, in airplane mode) is the
// one where attaching a console is hardest, and every failure in that area is
// silent. See src/diagnostics.ts.
import { installDiagnosticsPanel } from './diagnostics.ts';

installDiagnosticsPanel();
