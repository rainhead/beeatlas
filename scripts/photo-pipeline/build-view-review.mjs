#!/usr/bin/env node
/**
 * Blind review page for view classification.
 *
 *   node scripts/photo-pipeline/build-view-review.mjs && open .cache/photo-pipeline/views.html
 *
 * BLIND BY DEFAULT: the model's answer is hidden until you have labelled a photo. A
 * corrected-from-prediction label is anchored to the prediction, and the agreement rate
 * computed against it would be inflated by an unknown amount. beeatlas-zd7 is the standing
 * case -- a plausible CV signal survived until it was tested blind, then turned out to be
 * no better than the free baseline.
 *
 * Collects angle, subject and venation separately, because the slate slot is DERIVED from
 * those. A disagreement can then be traced to which judgement caused it, rather than
 * arriving as a single wrong slot.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, DATA, IMAGES } from './config.mjs';

const readJsonl = (f) => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

const MODEL_FILE = 'view-qwen_qwen3-vl-235b-a22b-instruct.jsonl';
const preds = new Map(readJsonl(path.join(OUT, MODEL_FILE)).map((r) => [r.photo_id, r]));
const sampleIds = JSON.parse(readFileSync(path.join(OUT, 'view-sample.json'), 'utf8'));
const pool = new Map(JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8')).map((p) => [p.photo_id, p]));
const framing = new Map(readJsonl(path.join(OUT, 'framing-qwen_qwen3-vl-235b-a22b-instruct.jsonl')).map((r) => [r.photo_id, r]));

const items = sampleIds.map((id) => {
  const p = pool.get(id), pred = preds.get(id);
  if (!p || !pred || pred.error) return null;
  return {
    photo_id: id,
    species: p.species,
    img: path.relative(DATA, p.small_path),
    full: path.relative(DATA, p.full_path),
    pred: { angle: pred.angle, subject: pred.subject, venation: pred.wing_venation_traceable, slots: pred.slots },
    framing_whole: framing.get(id)?.shows_whole_bee ?? null,
  };
}).filter(Boolean);

const ANGLES = ['dorsal', 'lateral', 'ventral', 'frontal', 'oblique'];
const SUBJECTS = ['whole-animal', 'head', 'thorax', 'abdomen', 'wing', 'legs', 'other'];

const html = `<!doctype html>
<meta charset="utf-8">
<title>View classification review</title>
<style>
  :root { --bg:#fbfaf8; --fg:#1c1a17; --muted:#6b6560; --line:#e2ddd6; --card:#fff;
          --accent:#7a5c1e; --good:#2d6a3f; --bad:#a33224; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#171614; --fg:#eae6e0; --muted:#9a938b; --line:#332f2a; --card:#201e1b;
            --accent:#d8b45e; --good:#6fbf87; --bad:#e4796a; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 ui-sans-serif,-apple-system,sans-serif; }
  header { position:sticky; top:0; z-index:5; background:var(--bg); padding:12px 20px;
           border-bottom:1px solid var(--line); display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:16px; margin:0; } .spacer { flex:1; }
  button { font:inherit; padding:6px 14px; border:1px solid var(--line); background:var(--card);
           color:var(--fg); border-radius:6px; cursor:pointer; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  main { max-width:1000px; margin:0 auto; padding:20px; }
  details.rule { background:var(--card); border:1px solid var(--line); border-radius:8px;
                 padding:10px 14px; margin:0 0 18px; font-size:13px; }
  details.rule summary { cursor:pointer; font-weight:600; color:var(--accent); }
  details.rule ol { padding-left:20px; } details.rule ul { padding-left:18px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; margin-bottom:18px; overflow:hidden; }
  .card.done { border-color:var(--good); }
  .row { display:flex; gap:18px; padding:16px; flex-wrap:wrap; }
  .imgwrap { flex:0 0 360px; max-width:100%; }
  .imgwrap img { width:100%; border-radius:6px; display:block; cursor:zoom-in; }
  .meta { font-size:13px; color:var(--muted); margin-top:6px; }
  .controls { flex:1; min-width:280px; }
  fieldset { border:none; padding:0; margin:0 0 12px; }
  legend { font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:5px; }
  .opts { display:flex; flex-wrap:wrap; gap:6px; }
  label.opt { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; border:1px solid var(--line);
              border-radius:999px; cursor:pointer; font-size:14px; }
  label.opt:has(input:checked) { background:var(--accent); border-color:var(--accent); color:#fff; }
  label.opt input { margin:0; }
  .reveal { padding:10px 16px; border-top:1px solid var(--line); }
  .pred { padding:12px 16px; border-top:1px solid var(--line); font-size:13px; }
  .pred[hidden] { display:none; }
  .hit { color:var(--good); font-weight:600; } .miss { color:var(--bad); font-weight:600; }
  dialog { border:none; padding:0; background:transparent; max-width:96vw; }
  dialog img { max-width:96vw; max-height:96vh; border-radius:8px; display:block; }
  dialog::backdrop { background:rgba(0,0,0,.88); }
</style>
<header>
  <h1>View classification review</h1>
  <span id="count"></span>
  <span class="spacer"></span>
  <button id="jump">Next unlabelled</button>
  <button id="export" class="primary">Export labels</button>
</header>
<main>
  <details class="rule" open>
    <summary>Angle is decided by symmetry, not by camera position</summary>
    <ol>
      <li><b>Bilaterally symmetric</b> — midline visible, both sides matching?
        <ul>
          <li>its back (tergites across the midline, wings either side) &rarr; <b>dorsal</b></li>
          <li>its underside (sternites, mouthparts from below) &rarr; <b>ventral</b></li>
          <li>its face down the long axis (both eyes, both antennal sockets) &rarr; <b>frontal</b></li>
        </ul>
      </li>
      <li>Otherwise <b>essentially one side</b>, far side hidden &rarr; <b>lateral</b></li>
      <li>Only if neither &mdash; two surfaces at once, neither square &rarr; <b>oblique</b></li>
    </ol>
    <p><b>Tie-break:</b> torn between a named view and oblique &rarr; choose the <b>named</b> view.
       Most photos should get a named view.</p>
    <p><b>Subject</b> is what fills the frame &mdash; <i>whole-animal</i> if the entire bee is shown,
       even with a leg or antenna tip cropped. <b>Venation</b> is true only if individual veins and
       the cells between them could be compared against a key.</p>
  </details>
  <div id="cards"></div>
</main>
<dialog id="zoom"><img></dialog>
<script>
const ITEMS = ${JSON.stringify(items)};
const ANGLES = ${JSON.stringify(ANGLES)};
const SUBJECTS = ${JSON.stringify(SUBJECTS)};
const KEY = 'beeatlas-views-v1';
const state = JSON.parse(localStorage.getItem(KEY) || '{}');
const cards = document.getElementById('cards');

ITEMS.forEach((it) => {
  const s = state[it.photo_id] ||= { angle: null, subject: null, venation: null, revealed: false };
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = \`
    <div class="row">
      <div>
        <div class="imgwrap"><img src="\${it.img}" data-full="\${it.full}" loading="lazy"></div>
        <div class="meta"><i>\${it.species}</i> &middot; \${it.photo_id}</div>
      </div>
      <div class="controls">
        <fieldset><legend>Angle</legend><div class="opts a"></div></fieldset>
        <fieldset><legend>Subject (what fills the frame)</legend><div class="opts s"></div></fieldset>
        <fieldset><legend>Wing venation traceable?</legend><div class="opts v"></div></fieldset>
      </div>
    </div>
    <div class="reveal"><button class="rev">Reveal model answer</button></div>
    <div class="pred" hidden></div>\`;

  const mk = (wrap, name, values, key) => {
    values.forEach((v) => {
      const l = document.createElement('label');
      l.className = 'opt';
      l.innerHTML = \`<input type="radio" name="\${name}\${it.photo_id}" value="\${v}"> \${v}\`;
      const i = l.querySelector('input');
      i.checked = s[key] === v;
      i.onchange = () => { s[key] = v; save(); };
      wrap.append(l);
    });
  };
  mk(el.querySelector('.a'), 'a', ANGLES, 'angle');
  mk(el.querySelector('.s'), 's', SUBJECTS, 'subject');
  mk(el.querySelector('.v'), 'v', ['yes', 'no'], 'venation');

  const pred = el.querySelector('.pred');
  const render = () => {
    const cls = (mine, theirs) => mine == null ? '' : (mine === theirs ? 'hit' : 'miss');
    const vTheirs = it.pred.venation ? 'yes' : 'no';
    pred.innerHTML = \`model: <span class="\${cls(s.angle, it.pred.angle)}">\${it.pred.angle}</span> /
      <span class="\${cls(s.subject, it.pred.subject)}">\${it.pred.subject}</span> /
      venation <span class="\${cls(s.venation, vTheirs)}">\${vTheirs}</span>
      &nbsp;&rarr;&nbsp; slots [\${it.pred.slots.join(', ') || '—'}]
      \${it.framing_whole === false ? '<br><span style="color:var(--muted)">framing pass called this a MACRO</span>' : ''}\`;
  };
  el.querySelector('.rev').onclick = () => { s.revealed = true; pred.hidden = false; el.querySelector('.reveal').remove(); render(); save(); };
  if (s.revealed) { pred.hidden = false; el.querySelector('.reveal').remove(); render(); }

  el.querySelector('img').onclick = (e) => { const d = document.getElementById('zoom'); d.querySelector('img').src = e.target.dataset.full; d.showModal(); };
  cards.append(el);
  it._el = el;
});

document.getElementById('zoom').onclick = (e) => e.currentTarget.close();
const isDone = (it) => { const s = state[it.photo_id]; return s.angle && s.subject && s.venation; };

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  let n = 0;
  ITEMS.forEach((it) => { const d = isDone(it); if (d) n++; it._el.classList.toggle('done', d); });
  document.getElementById('count').textContent = \`\${n} / \${ITEMS.length} labelled\`;
}
save();

document.getElementById('jump').onclick = () => {
  const next = ITEMS.find((it) => !isDone(it));
  if (next) next._el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

document.getElementById('export').onclick = () => {
  const labels = ITEMS.filter(isDone).map((it) => ({
    photo_id: it.photo_id, species: it.species,
    angle: state[it.photo_id].angle,
    subject: state[it.photo_id].subject,
    wing_venation_traceable: state[it.photo_id].venation === 'yes',
  }));
  const b = new Blob([JSON.stringify({ labels }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'view-labels.json'; a.click();
};
</script>
`;

const dest = path.join(DATA, 'views.html');
writeFileSync(dest, html);
console.log(`${dest}\n  ${items.length} photos to review (blind; model answer hidden until revealed)`);
