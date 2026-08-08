#!/usr/bin/env node
/**
 * Review page for coverage-based re-selection: current set beside proposed set.
 *   node scripts/photo-pipeline/build-coverage-review.mjs && open .cache/photo-pipeline/coverage.html
 *
 * Shows only species whose set would CHANGE. Per-part scores are shown under each photo
 * because the decision is visual and the numbers are a claim, not a verdict.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { OUT, DATA, IMAGES, MANIFEST, PART_KEYS } from './config.mjs';

const { results, readable } = JSON.parse(readFileSync(path.join(OUT, 'coverage-proposals.json'), 'utf8'));
const scored = new Map(readFileSync(path.join(OUT, 'candidate-parts.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.error).map((r) => [r.photo_id, r]));
const manifest = TOML.parse(readFileSync(MANIFEST, 'utf8'));

const rel = (id) => {
  const p = path.join(IMAGES, `${id}-512.jpg`);
  return existsSync(p) ? path.relative(DATA, p) : null;
};

const items = results.map((r) => {
  const proposedIds = r.proposed_photos.map((p) => p.photo_id);
  const changed = proposedIds.length !== r.shipped_ids.length
    || proposedIds.some((id, i) => id !== r.shipped_ids[i]);
  if (!changed) return null;
  const entry = manifest.species[r.species];
  const shipped = (entry?.photos ?? []).map((p) => ({
    photo_id: p.photo_id, img: rel(p.photo_id),
    scores: scored.get(p.photo_id) ? Object.fromEntries(PART_KEYS.map((k) => [k, scored.get(p.photo_id)[k]])) : null,
    information: scored.get(p.photo_id)?.information ?? null,
  }));
  return {
    species: r.species,
    candidates: r.candidates,
    shipped, proposed: r.proposed_photos.map((p) => ({ ...p, img: rel(p.photo_id) })),
    shipped_readable: r.shipped_readable, proposed_readable: r.proposed_readable,
    delta: (r.proposed_readable ?? 0) - (r.shipped_readable ?? 0),
  };
}).filter(Boolean).sort((a, b) => b.delta - a.delta || b.candidates - a.candidates);

const html = `<!doctype html>
<meta charset="utf-8"><title>Coverage re-selection review</title>
<style>
 :root{--bg:#fbfaf8;--fg:#1c1a17;--muted:#6b6560;--line:#e2ddd6;--card:#fff;--accent:#7a5c1e;--good:#2d6a3f;--bad:#a33224}
 @media(prefers-color-scheme:dark){:root{--bg:#171614;--fg:#eae6e0;--muted:#9a938b;--line:#332f2a;--card:#201e1b;--accent:#d8b45e;--good:#6fbf87;--bad:#e4796a}}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,-apple-system,sans-serif}
 header{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 20px;border-bottom:1px solid var(--line);display:flex;gap:14px;align-items:center;flex-wrap:wrap}
 h1{font-size:16px;margin:0}.spacer{flex:1}
 button{font:inherit;padding:6px 14px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;cursor:pointer}
 button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
 main{max-width:1180px;margin:0 auto;padding:20px}
 .note{color:var(--muted);font-size:13px;border-left:3px solid var(--line);padding-left:12px;margin:0 0 18px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:18px;overflow:hidden}
 .card.accepted{border-color:var(--good)}.card.rejected{opacity:.45}
 .hd{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
 .hd i{font-weight:600;font-size:15px}.hd .m{color:var(--muted);font-size:13px}
 .up{color:var(--good);font-weight:600}
 .side{padding:12px 16px}
 .side h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 8px}
 .strip{display:flex;gap:10px;flex-wrap:wrap}
 figure{margin:0;width:190px}
 figure img{width:190px;height:143px;object-fit:cover;border-radius:6px;display:block;cursor:zoom-in;background:#0002}
 figcaption{font-size:11px;color:var(--muted);margin-top:4px;font-variant-numeric:tabular-nums}
 .sc b{color:var(--fg)}
 .divider{border-top:1px dashed var(--line)}
 .actions{padding:10px 16px;border-top:1px solid var(--line);display:flex;gap:8px}
 dialog{border:none;padding:0;background:transparent;max-width:96vw}
 dialog img{max-width:96vw;max-height:96vh;border-radius:8px;display:block}
 dialog::backdrop{background:rgba(0,0,0,.88)}
</style>
<header><h1>Coverage re-selection</h1><span id="count"></span><span class="spacer"></span>
<button id="jump">Next undecided</button><button id="export" class="primary">Export accepted</button></header>
<main>
 <p class="note">Each species shows the <b>current</b> set and the <b>proposed</b> one. Photos are
 chosen to cover every body part at a readable level (${readable}+ of 3), one photo per observation,
 then topped up to three with the best remaining photos from other observations. Numbers under each
 photo are per-part scores <b>h t a w l</b> and the information total of 15 &mdash; they rank
 candidates, they do not judge them. Nothing here edits the manifest.</p>
 <div id="cards"></div>
</main>
<dialog id="zoom"><img></dialog>
<script>
const ITEMS=${JSON.stringify(items)};
const PARTS=${JSON.stringify(PART_KEYS)};
const KEY='beeatlas-coverage-v1';
const state=JSON.parse(localStorage.getItem(KEY)||'{}');
const cards=document.getElementById('cards');
const fig=(p)=>{
  if(!p.img) return '';
  const sc=p.scores??p;
  const nums=PARTS.map(k=>k[0]+(sc[k]??'-')).join(' ');
  return \`<figure><img src="\${p.img}" data-full="\${p.img}" loading="lazy">
    <figcaption>\${p.photo_id}<br><span class="sc">\${nums} &middot; <b>\${p.information??'?'}</b>/15</span>\${p.quality_grade&&p.quality_grade!=='research'?'<br>'+p.quality_grade:''}</figcaption></figure>\`;
};
ITEMS.forEach((it)=>{
  const el=document.createElement('div'); el.className='card';
  el.innerHTML=\`<div class="hd"><i>\${it.species}</i>
      <span class="m">\${it.candidates} candidates</span>
      <span class="\${it.delta>0?'up':'m'}">\${it.shipped_readable??'?'}/5 &rarr; \${it.proposed_readable}/5 parts readable</span></div>
    <div class="side"><h3>current (\${it.shipped.length})</h3><div class="strip">\${it.shipped.map(fig).join('')}</div></div>
    <div class="side divider"><h3>proposed (\${it.proposed.length})</h3><div class="strip">\${it.proposed.map(fig).join('')}</div></div>
    <div class="actions"><button class="acc">Accept</button><button class="rej">Keep current</button></div>\`;
  const set=(v)=>{state[it.species]=v;save();};
  el.querySelector('.acc').onclick=()=>set('accept');
  el.querySelector('.rej').onclick=()=>set('reject');
  el.querySelectorAll('img').forEach(i=>i.onclick=()=>{const d=document.getElementById('zoom');d.querySelector('img').src=i.dataset.full;d.showModal();});
  cards.append(el); it._el=el;
});
document.getElementById('zoom').onclick=(e)=>e.currentTarget.close();
function save(){localStorage.setItem(KEY,JSON.stringify(state));
  let a=0,r=0; ITEMS.forEach(it=>{const v=state[it.species];it._el.classList.toggle('accepted',v==='accept');it._el.classList.toggle('rejected',v==='reject');if(v==='accept')a++;if(v==='reject')r++;});
  document.getElementById('count').textContent=\`\${ITEMS.length} changed · \${a} accepted · \${r} kept · \${ITEMS.length-a-r} undecided\`;}
save();
document.getElementById('jump').onclick=()=>{const n=ITEMS.find(it=>!state[it.species]); if(n)n._el.scrollIntoView({behavior:'smooth',block:'center'});};
document.getElementById('export').onclick=()=>{
  const accepted=ITEMS.filter(it=>state[it.species]==='accept').map(it=>({species:it.species,photos:it.proposed.map(p=>({photo_id:p.photo_id,observation_id:p.observation_id,url:p.url,license:p.license,attribution:p.attribution}))}));
  const b=new Blob([JSON.stringify({accepted},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='accepted-sets.json';a.click();};
</script>`;
writeFileSync(path.join(DATA, 'coverage.html'), html);
console.log(`${path.join(DATA, 'coverage.html')}\n  ${items.length} species whose set would change`);
