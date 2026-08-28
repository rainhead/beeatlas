// Vite Rollup entry for the /design proofing pages (ADR 0039).
//
// This entry mounts PRESENTERS ONLY. It must never import src/bee-atlas.ts,
// src/app-entry.ts, or the service-worker registration: the entry list in
// vite.config.ts exists to make "a template that mounts the map without the
// worker" impossible, and a proofing page is exactly the kind of template that
// would otherwise do it by accident. Importing filter.ts for a value would drag
// the inlined wa-sqlite worker in too — see src/design/proofs.ts.
//
// The page itself is nearly empty: Eleventy renders the chrome and one
// container per section, and the frames are built here, because a state is a
// typed fixture in TypeScript rather than something Nunjucks could describe.
import '../index.css';
import '../styles/design.css';
import { PROOFS, type ProofState } from '../design/proofs.ts';

function frame(state: ProofState): HTMLElement {
  const section = document.createElement('section');
  section.className = 'specimen';
  section.id = state.id;

  const header = document.createElement('div');
  header.className = 'specimen-header';
  const heading = document.createElement('h2');
  // The anchor is the label: a state you can point someone at is a state you
  // can file a bug against.
  const anchor = document.createElement('a');
  anchor.href = `#${state.id}`;
  anchor.textContent = state.label;
  heading.append(anchor);
  header.append(heading);
  if (state.note !== undefined) {
    const note = document.createElement('p');
    note.className = 'specimen-note';
    note.textContent = state.note;
    header.append(note);
  }
  section.append(header);

  // The stage is pane-width on purpose: the detail card is only ever seen
  // inside the sidebar, and proofing it full-bleed would flatter every
  // treatment that wraps in the real thing.
  const stage = document.createElement('div');
  stage.className = 'specimen-stage';
  stage.append(state.render());
  section.append(stage);
  return section;
}

const host = document.querySelector<HTMLElement>('[data-design-section]');
if (host !== null) {
  const slug = host.dataset.designSection ?? '';
  const states = PROOFS[slug];
  if (states === undefined) {
    // A listed section with nothing to show. The test catches this before it
    // ships; saying so on the page is for whoever is mid-edit.
    host.textContent = `No proofs registered for section "${slug}".`;
  } else {
    for (const state of states) host.append(frame(state));
  }
}
