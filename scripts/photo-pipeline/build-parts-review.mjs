#!/usr/bin/env node
/**
 * Blind review page for part-visibility scores.
 *   node scripts/photo-pipeline/build-parts-review.mjs && open .cache/photo-pipeline/parts.html
 *
 * Blind by default -- the model's scores stay hidden until you have scored a photo, so the
 * agreement rate is not inflated by anchoring (beeatlas-zd7).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { OUT, DATA, PART_KEYS, PARTS_PROMPT } from './config.mjs';

const readJsonl = (f) => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const preds = new Map(readJsonl(path.join(OUT, 'parts-qwen_qwen3-vl-235b-a22b-instruct.jsonl')).filter((r) => !r.error).map((r) => [r.photo_id, r]));
const pool = new Map(JSON.parse(readFileSync(path.join(OUT, 'pool.json'), 'utf8')).map((p) => [p.photo_id, p]));

const items = [...preds.keys()].filter((id) => pool.has(id)).map((id) => {
  const p = pool.get(id), pr = preds.get(id);
  return {
    photo_id: id, species: p.species,
    img: path.relative(DATA, p.small_path), full: path.relative(DATA, p.full_path),
    pred: Object.fromEntries(PART_KEYS.map((k) => [k, pr[k]])), info: pr.information,
  };
});

const LADDER = [
  ['0', 'not visible'],
  ['1', 'present, not readable'],
  ['2', 'clearly visible'],
  ['3', 'diagnostic detail readable'],
];

const html = `<!doctype html>
<meta charset="utf-8"><title>Part visibility review</title>
<style>
  :root{--bg:#fbfaf8;--fg:#1c1a17;--muted:#6b6560;--line:#e2ddd6;--card:#fff;--accent:#7a5c1e;--good:#2d6a3f;--bad:#a33224}
  @media(prefers-color-scheme:dark){:root{--bg:#171614;--fg:#eae6e0;--muted:#9a938b;--line:#332f2a;--card:#201e1b;--accent:#d8b45e;--good:#6fbf87;--bad:#e4796a}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,-apple-system,sans-serif}
  header{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 20px;border-bottom:1px solid var(--line);display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  h1{font-size:16px;margin:0}.spacer{flex:1}
  button{font:inherit;padding:6px 14px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;cursor:pointer}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
  main{max-width:1000px;margin:0 auto;padding:20px}
  details.rule{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:0 0 18px;font-size:13px}
  details.rule summary{cursor:pointer;font-weight:600;color:var(--accent)}
  details.rule dt{font-weight:600;margin-top:6px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:18px;overflow:hidden}
  .card.done{border-color:var(--good)}
  .row{display:flex;gap:18px;padding:16px;flex-wrap:wrap}
  .imgwrap{flex:0 0 340px;max-width:100%}
  .imgwrap img{width:100%;border-radius:6px;display:block;cursor:zoom-in}
  .meta{font-size:13px;color:var(--muted);margin-top:6px}
  table{border-collapse:collapse;flex:1;min-width:300px}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;padding:0 6px 4px 0}
  td{padding:3px 6px 3px 0}
  td.part{font-weight:600;width:80px}
  .scores{display:flex;gap:4px}
  label.sc{display:inline-flex;align-items:center;justify-content:center;width:34px;height:30px;border:1px solid var(--line);border-radius:6px;cursor:pointer;font-variant-numeric:tabular-nums}
  label.sc:has(input:checked){background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
  label.sc input{display:none}
  .reveal{padding:10px 16px;border-top:1px solid var(--line)}
  .pred{padding:12px 16px;border-top:1px solid var(--line);font-size:13px}
  .pred[hidden]{display:none}
  .hit{color:var(--good);font-weight:600}.near{color:var(--muted)}.miss{color:var(--bad);font-weight:600}
  dialog{border:none;padding:0;background:transparent;max-width:96vw}
  dialog img{max-width:96vw;max-height:96vh;border-radius:8px;display:block}
  dialog::backdrop{background:rgba(0,0,0,.88)}
</style>
<header>
  <h1>Part visibility review</h1><span id="count"></span>
  <span class="spacer"></span>
  <button id="jump">Next unscored</button>
  <button id="export" class="primary">Export scores</button>
</header>
<main>
  <details class="rule" open>
    <summary>The scale — same wording the model was given</summary>
    <dl>
      ${LADDER.map(([n, t]) => `<dt>${n} &mdash; ${t}</dt>`).join('')}
    </dl>
    <p>Diagnostic detail differs per part: <b>head</b> facial markings, antennae, eye margins &middot;
       <b>thorax</b> scutum punctation, hair pattern, scutellum &middot;
       <b>abdomen</b> tergite banding and punctation &middot;
       <b>wings</b> individual veins and the cells between them &middot;
       <b>legs</b> tibial and tarsal structure, scopa.</p>
    <p>Score what you can actually see. A part turned away or foreshortened is not readable
       however sharp the photo is. Be strict about 3.</p>
  </details>
  <div id="cards"></div>
</main>
<dialog id="zoom"><img></dialog>
<script>
const ITEMS=${JSON.stringify(items)};
const PARTS=${JSON.stringify(PART_KEYS)};
const KEY='beeatlas-parts-v1';
const state=JSON.parse(localStorage.getItem(KEY)||'{}');
const cards=document.getElementById('cards');

ITEMS.forEach((it)=>{
  const s=state[it.photo_id]||=({scores:{},revealed:false});
  const el=document.createElement('div');
  el.className='card';
  el.innerHTML=\`<div class="row">
      <div><div class="imgwrap"><img src="\${it.img}" data-full="\${it.full}" loading="lazy"></div>
        <div class="meta"><i>\${it.species}</i> &middot; \${it.photo_id}</div></div>
      <table><tr><th>part</th><th>0 &nbsp; 1 &nbsp; 2 &nbsp; 3</th></tr>\${PARTS.map((p)=>
        \`<tr><td class="part">\${p}</td><td><div class="scores" data-part="\${p}"></div></td></tr>\`).join('')}</table>
    </div>
    <div class="reveal"><button class="rev">Reveal model scores</button></div>
    <div class="pred" hidden></div>\`;

  PARTS.forEach((p)=>{
    const wrap=el.querySelector(\`.scores[data-part="\${p}"]\`);
    [0,1,2,3].forEach((v)=>{
      const l=document.createElement('label'); l.className='sc';
      l.innerHTML=\`<input type="radio" name="\${p}\${it.photo_id}" value="\${v}">\${v}\`;
      const i=l.querySelector('input');
      i.checked=s.scores[p]===v;
      i.onchange=()=>{s.scores[p]=v;save();};
      wrap.append(l);
    });
  });

  const pred=el.querySelector('.pred');
  const render=()=>{
    pred.innerHTML='model: '+PARTS.map((p)=>{
      const mine=s.scores[p], theirs=it.pred[p];
      const cls=mine==null?'':(mine===theirs?'hit':(Math.abs(mine-theirs)===1?'near':'miss'));
      return \`\${p} <span class="\${cls}">\${theirs}</span>\`;
    }).join(' &middot; ')+\` &nbsp;&rarr;&nbsp; information \${it.info}/15\`;
  };
  el.querySelector('.rev').onclick=()=>{s.revealed=true;pred.hidden=false;el.querySelector('.reveal').remove();render();save();};
  if(s.revealed){pred.hidden=false;el.querySelector('.reveal').remove();render();}
  el.querySelector('img').onclick=(e)=>{const d=document.getElementById('zoom');d.querySelector('img').src=e.target.dataset.full;d.showModal();};
  cards.append(el); it._el=el;
});
document.getElementById('zoom').onclick=(e)=>e.currentTarget.close();
const isDone=(it)=>PARTS.every((p)=>state[it.photo_id].scores[p]!=null);
function save(){
  localStorage.setItem(KEY,JSON.stringify(state));
  let n=0; ITEMS.forEach((it)=>{const d=isDone(it); if(d)n++; it._el.classList.toggle('done',d);});
  document.getElementById('count').textContent=\`\${n} / \${ITEMS.length} scored\`;
}
save();
document.getElementById('jump').onclick=()=>{const nx=ITEMS.find((it)=>!isDone(it)); if(nx)nx._el.scrollIntoView({behavior:'smooth',block:'center'});};
document.getElementById('export').onclick=()=>{
  const scores=ITEMS.filter(isDone).map((it)=>({photo_id:it.photo_id,species:it.species,...state[it.photo_id].scores}));
  const b=new Blob([JSON.stringify({scores},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='part-scores.json'; a.click();
};
</script>`;

const dest = path.join(DATA, 'parts.html');
writeFileSync(dest, html);
console.log(`${dest}\n  ${items.length} photos, ${PART_KEYS.length} parts each (blind)`);
