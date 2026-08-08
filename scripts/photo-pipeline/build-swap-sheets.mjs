#!/usr/bin/env node
/**
 * Build the swap review page: current photo beside its proposed replacement.
 *
 *   node scripts/photo-pipeline/build-swap-sheets.mjs && open .cache/photo-pipeline/swaps.html
 *
 * The decision is VISUAL. Subject fraction ranks candidates, it does not judge them, so the
 * page shows both frames at size and puts the numbers underneath. Every badge on the page
 * is a signal that has been wrong at least once today, so each is labelled as a claim
 * rather than a fact.
 *
 * Writes into .cache/photo-pipeline/ so image paths stay relative. NOTHING here edits
 * content/species-photos.toml -- accepting a swap exports JSON for a separate apply step.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, DATA, IMAGES } from './config.mjs';

const { proposals, criteria, model, reference } = JSON.parse(readFileSync(path.join(OUT, 'swaps.json'), 'utf8'));
const winners = proposals.filter((p) => p.qualifies);

const rel = (id) => {
  const p = path.join(IMAGES, `${id}-512.jpg`);
  return existsSync(p) ? path.relative(DATA, p) : null;
};
const full = (id) => {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const p = path.join(IMAGES, `${id}-full${ext}`);
    if (existsSync(p)) return path.relative(DATA, p);
  }
  return rel(id);
};

const items = winners
  .map((w) => ({ ...w, cur_img: rel(w.current_photo_id), new_img: rel(w.best_sibling_photo_id),
                 cur_full: full(w.current_photo_id), new_full: full(w.best_sibling_photo_id) }))
  .filter((w) => w.cur_img && w.new_img);

const demoted = proposals.filter((p) => p.loses_whole_bee).length;

const html = `<!doctype html>
<meta charset="utf-8">
<title>Photo swap proposals</title>
<style>
  :root { --bg:#fbfaf8; --fg:#1c1a17; --muted:#6b6560; --line:#e2ddd6; --card:#fff;
          --accent:#7a5c1e; --good:#2d6a3f; --bad:#a33224; --warn:#8a6d1f; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#171614; --fg:#eae6e0; --muted:#9a938b; --line:#332f2a; --card:#201e1b;
            --accent:#d8b45e; --good:#6fbf87; --bad:#e4796a; --warn:#e0bc63; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",sans-serif; }
  header { position:sticky; top:0; z-index:5; background:var(--bg); padding:12px 20px;
           border-bottom:1px solid var(--line); display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:16px; margin:0; }
  .spacer { flex:1; }
  button { font:inherit; padding:6px 14px; border:1px solid var(--line); background:var(--card);
           color:var(--fg); border-radius:6px; cursor:pointer; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  main { max-width:1120px; margin:0 auto; padding:20px; }
  .note { color:var(--muted); font-size:13px; border-left:3px solid var(--line);
          padding-left:12px; margin:0 0 14px; }
  .note b { color:var(--fg); }
  details.caveat { background:var(--card); border:1px solid var(--line); border-radius:8px;
                   padding:10px 14px; margin:0 0 20px; font-size:13px; }
  details.caveat summary { cursor:pointer; font-weight:600; color:var(--accent); }
  details.caveat li { margin:5px 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
          margin-bottom:18px; overflow:hidden; }
  .card.accepted { border-color:var(--good); }
  .card.rejected { opacity:.45; }
  .hd { padding:10px 16px; border-bottom:1px solid var(--line);
        display:flex; gap:12px; align-items:baseline; flex-wrap:wrap; }
  .hd i { font-size:15px; font-weight:600; }
  .hd .m { color:var(--muted); font-size:13px; }
  .pair { display:flex; gap:12px; padding:14px; flex-wrap:wrap; }
  .side { flex:1 1 340px; }
  .side img { width:100%; border-radius:6px; display:block; cursor:zoom-in; background:#0002; }
  .cap { font-size:13px; color:var(--muted); margin-top:6px; }
  .cap b { color:var(--fg); font-variant-numeric:tabular-nums; }
  .tag { display:inline-block; font-size:11px; text-transform:uppercase; letter-spacing:.05em;
         padding:2px 7px; border-radius:4px; margin-bottom:5px; }
  .tag.cur { background:var(--line); color:var(--muted); }
  .tag.new { background:var(--accent); color:#fff; }
  .badge { display:inline-block; font-size:11px; padding:1px 6px; border-radius:4px;
           border:1px solid var(--line); margin-left:6px; }
  .badge.whole { color:var(--good); border-color:var(--good); }
  .badge.macro { color:var(--warn); border-color:var(--warn); }
  .badge.edges { color:var(--bad); border-color:var(--bad); }
  .actions { padding:10px 16px; border-top:1px solid var(--line); display:flex; gap:8px; align-items:center; }
  .actions .m { color:var(--muted); font-size:12px; }
  dialog { border:none; padding:0; background:transparent; max-width:96vw; }
  dialog img { max-width:96vw; max-height:96vh; border-radius:8px; display:block; }
  dialog::backdrop { background:rgba(0,0,0,.88); }
</style>
<header>
  <h1>Photo swap proposals</h1>
  <span id="count"></span>
  <span class="spacer"></span>
  <button id="jump">Next undecided</button>
  <button id="export" class="primary">Export accepted</button>
</header>
<main>
  <p class="note">
    Each pair is the <b>same observation, same photographer, same license</b> &mdash; only the
    frame differs. The seeder always takes the observer's first licensed photo; these are the
    siblings it discarded. Proposed when the bee occupies at least <b>${criteria.MIN_RATIO}&times;</b>
    and <b>+${criteria.MIN_ABSOLUTE_GAIN} points</b> more of the frame.
    Nothing here edits the manifest.
  </p>

  <details class="caveat">
    <summary>What the numbers mean, and where they have been wrong</summary>
    <ul>
      <li><b>% of frame</b> &mdash; area of the model's bee box. It <i>ranks</i> candidates;
        it does not judge them. A bigger bee can still be a worse photo.</li>
      <li><b>whole / macro</b> &mdash; whether head, thorax and abdomen are all fully in frame.
        This is what stops a cropped close-up being proposed as a replacement for a habitus
        shot. <b>${demoted}</b> proposals were demoted on this basis and are not shown.</li>
      <li><b>edges N</b> &mdash; how many frame edges the box touches, computed geometrically
        rather than by the model. 3&ndash;4 is a strong crop signal and worth a second look
        even when the framing check passed.</li>
      <li><b>Treat ~100% claims sceptically.</b> A box filling the frame can mean a bee that
        fills the frame, or a macro that runs off it. Both appear here; only the picture
        settles it.</li>
    </ul>
  </details>

  <div id="cards"></div>
</main>
<dialog id="zoom"><img></dialog>
<script>
const ITEMS = ${JSON.stringify(items)};
const KEY = 'beeatlas-swaps-v2';
const state = JSON.parse(localStorage.getItem(KEY) || '{}');
const cards = document.getElementById('cards');

const badge = (whole, edges) => {
  let h = '';
  if (whole === true) h += '<span class="badge whole">whole bee</span>';
  else if (whole === false) h += '<span class="badge macro">macro</span>';
  if (edges >= 3) h += \`<span class="badge edges">edges \${edges}</span>\`;
  return h;
};

ITEMS.forEach((it) => {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = \`
    <div class="hd">
      <i>\${it.species}</i>
      <span class="m">obs \${it.observation_id}</span>
      <span class="m">+\${it.gain.toFixed(1)} pts &middot; \${it.ratio.toFixed(1)}&times;</span>
    </div>
    <div class="pair">
      <div class="side">
        <span class="tag cur">current</span>
        <img src="\${it.cur_img}" data-full="\${it.cur_full}" loading="lazy">
        <div class="cap">photo \${it.current_photo_id} &middot; bee is <b>\${it.current_fraction.toFixed(1)}%</b> of frame\${badge(it.current_whole_bee, null)}</div>
      </div>
      <div class="side">
        <span class="tag new">proposed</span>
        <img src="\${it.new_img}" data-full="\${it.new_full}" loading="lazy">
        <div class="cap">photo \${it.best_sibling_photo_id} &middot; bee is <b>\${it.best_sibling_fraction.toFixed(1)}%</b> of frame\${badge(it.best_sibling_whole_bee, it.best_sibling_edges)}</div>
      </div>
    </div>
    <div class="actions">
      <button class="acc">Accept swap</button>
      <button class="rej">Keep current</button>
      <span class="m">click either image for full size</span>
    </div>\`;

  const set = (v) => { state[it.current_photo_id] = v; save(); };
  el.querySelector('.acc').onclick = () => set('accept');
  el.querySelector('.rej').onclick = () => set('reject');
  el.querySelectorAll('img').forEach((img) => {
    img.onclick = () => { const d = document.getElementById('zoom'); d.querySelector('img').src = img.dataset.full; d.showModal(); };
  });
  cards.append(el);
  it._el = el;
});

document.getElementById('zoom').onclick = (e) => e.currentTarget.close();

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  let a = 0, r = 0;
  ITEMS.forEach((it) => {
    const v = state[it.current_photo_id];
    it._el.classList.toggle('accepted', v === 'accept');
    it._el.classList.toggle('rejected', v === 'reject');
    if (v === 'accept') a++; if (v === 'reject') r++;
  });
  document.getElementById('count').textContent =
    \`\${ITEMS.length} proposed · \${a} accepted · \${r} kept · \${ITEMS.length - a - r} undecided\`;
}
save();

document.getElementById('jump').onclick = () => {
  const next = ITEMS.find((it) => !state[it.current_photo_id]);
  if (next) next._el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

document.getElementById('export').onclick = () => {
  const accepted = ITEMS.filter((it) => state[it.current_photo_id] === 'accept').map((it) => ({
    species: it.species,
    observation_id: it.observation_id,
    replace_photo_id: it.current_photo_id,
    with_photo_id: it.best_sibling_photo_id,
    url: it.url, license: it.license, attribution: it.attribution,
  }));
  const b = new Blob([JSON.stringify({ model: ${JSON.stringify(model)}, accepted }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'accepted-swaps.json'; a.click();
};
</script>
`;

const dest = path.join(DATA, 'swaps.html');
writeFileSync(dest, html);
console.log(`${dest}`);
console.log(`  ${items.length} proposals with both images present (of ${winners.length} qualifying)`);
console.log(`  ${demoted} demoted for losing whole-bee framing, not shown`);
console.log(`  scored by ${model}, reference ${reference}`);
