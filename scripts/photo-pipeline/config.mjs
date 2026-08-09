/**
 * Shared configuration for the photo pipeline.
 *
 * Paths, the license whitelist, and the prompts/schemas sent to the local VLM. Kept in one
 * place so a run in progress and any probe against it are provably asking the same
 * question -- during the first build these drifted into two copies and had to be checked
 * for byte-parity by hand.
 *
 * DATA LIVES IN .cache/photo-pipeline/ (gitignored, durable). It must NOT live in an
 * agent scratchpad: the first build did, and a session restart deleted ~11 hours of
 * compute along with every downloaded image.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DATA = path.join(ROOT, '.cache', 'photo-pipeline');
export const IMAGES = path.join(DATA, 'images');
export const OUT = path.join(DATA, 'out');
export const MANIFEST = path.join(ROOT, 'content', 'species-photos.toml');

export const ENDPOINT = 'http://localhost:1234/v1/chat/completions';
export const DEFAULT_MODEL = 'qwen3-vl-8b-instruct-mlx';

/**
 * Where inference runs. Both providers speak the same OpenAI-compatible request shape, so
 * only the URL and headers differ.
 *
 *   local       LM Studio on localhost:1234. Also proxies models loaded on other LM Link
 *               devices (e.g. the Windows desktop), so a remote GPU is still "local" here.
 *   openrouter  Hosted. Measured at ~$0.0001 and ~0.6s per 512px image -- cheaper and
 *               faster than either local machine, and it removes the cross-quantization
 *               bias that came from scoring one side of a comparison on MLX and the other
 *               on GGUF (-2.7 points, rank-preserving but systematically one-directional).
 *
 * The key is read from .env, which is gitignored. It is never logged.
 */
export function resolveProvider(name, model) {
  if (name === 'openrouter') {
    const envPath = path.join(ROOT, '.env');
    const env = Object.fromEntries(
      readFileSync(envPath, 'utf8').split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
    );
    if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing from .env');
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://beeatlas.net',
        'X-Title': 'BeeAtlas photo pipeline',
      },
      // Ask for per-request cost so a long run reports actual spend rather than an estimate.
      extraBody: { usage: { include: true } },
      concurrency: 6,
    };
  }
  return {
    url: ENDPOINT,
    headers: { 'Content-Type': 'application/json' },
    extraBody: {},
    // LM Studio serves sequentially here; parallel requests contend for one GPU.
    concurrency: 1,
  };
}
export const USER_AGENT = 'BeeAtlas/photo-pipeline (rainhead@gmail.com; github.com/rainhead/beeatlas)';

// Re-exported, not redeclared: a swap that fails validation is worse than none, and a second
// copy of the contract vocabulary is how the two drift apart. validate-species.mjs owns both.
export { LICENSE_WHITELIST, PHOTO_PROVENANCE, isCuratorTouched } from '../validate-species.mjs';

// ---------------------------------------------------------------------------
// Localization: put a box on the bee.
// ---------------------------------------------------------------------------

export const LOCATE_SCHEMA = {
  type: 'object',
  properties: {
    bees: {
      type: 'array',
      description: 'One entry per bee. Empty if there is no bee in the photo.',
      items: {
        type: 'object',
        properties: {
          x0: { type: 'integer' }, y0: { type: 'integer' },
          x1: { type: 'integer' }, y1: { type: 'integer' },
          in_focus: { type: 'boolean', description: 'Is THIS bee sharp, as opposed to a blurred background individual?' },
        },
        required: ['x0', 'y0', 'x1', 'y1', 'in_focus'],
        additionalProperties: false,
      },
    },
  },
  required: ['bees'],
  additionalProperties: false,
};

export const LOCATE_PROMPT = `Find every bee in this photograph.

For each bee, give a tight bounding box around THE WHOLE INSECT — including antennae,
legs and wings, not just the compact body core. The box should be the smallest rectangle
that still contains every part of the bee.

Coordinates are integers on a 0-1000 grid, where (0,0) is the TOP-LEFT of the image and
(1000,1000) is the BOTTOM-RIGHT. x0,y0 is the top-left corner of the box and x1,y1 is the
bottom-right corner, so x1 > x0 and y1 > y0.

Include every bee you can see, even small or out-of-focus ones in the background, and set
in_focus to false for those. Do NOT include flowers, other insects, or the background.
If there is no bee at all, return an empty list.`;

// ---------------------------------------------------------------------------
// Framing: is the whole bee in the picture, or is this a macro of part of one?
//
// The product rule this serves: a species page's first photo or two should show the whole
// bee. Macros of diagnostic structures are valuable but belong later in the order.
//
// Asks CONCRETE questions and derives the binary in code. An earlier version asked directly
// for "whole-animal vs part-closeup" and failed its control, calling an entire bee at 81.8%
// of frame a part-closeup. The concrete form scored 8/8 on hand-checked cases, with
// cut_off_by_frame doing all the work.
// ---------------------------------------------------------------------------

export const FRAMING_SCHEMA = {
  type: 'object',
  properties: {
    cut_off_by_frame: { type: 'boolean', description: 'Does any part of the bee run off the edge of the picture?' },
    parts_fully_visible: {
      type: 'array',
      items: { type: 'string', enum: ['head', 'thorax', 'abdomen', 'wings', 'legs'] },
      description: 'Only parts ENTIRELY within the picture.',
    },
  },
  required: ['cut_off_by_frame', 'parts_fully_visible'],
  additionalProperties: false,
};

export const FRAMING_PROMPT = `This is a photograph of a bee. Answer two concrete questions about FRAMING.
Do not judge photo quality, sharpness, or the angle.

cut_off_by_frame — Is any part of the bee cropped by the edge of the picture? Answer true
  if the bee continues past the edge of the frame; false if you can see the bee's entire
  outline with background all the way around it.

parts_fully_visible — Which of head, thorax, abdomen, wings, legs are COMPLETELY inside
  the picture? Include a part only if all of it is visible. Omit any part that is cut off
  by the frame, or hidden behind something. A bee may genuinely have no visible wings or
  legs from some angles — omit those too.`;

/**
 * A whole bee shows its three body regions entirely. Derived, not asked.
 *
 * DELIBERATELY IGNORES cut_off_by_frame. An earlier version required it to be false, and
 * that classified 404 of 426 manifest photos as macros -- because the model answers that
 * question LITERALLY and correctly: on a field photo a leg tip or antenna very often
 * crosses the frame edge. A bee with a cropped antenna is still a habitus shot; a macro of
 * the thorax is not, and the core-parts test is what separates them. Verified against
 * hand-checked cases: 247931226 [head,thorax] -> macro, 598389167 [] -> macro,
 * 217816412 [head,thorax,abdomen] -> whole.
 *
 * cut_off_by_frame is still RECORDED, because it is a real signal about tight cropping --
 * it is just not the gate. The strict version passed an 8/8 test built mostly from pinned
 * specimens on plain backgrounds, where nothing touches an edge; the manifest is field
 * photos, where things routinely do. Small validation sets that miss the real distribution
 * are how a wrong rule looks right.
 */
export const CORE_PARTS = ['head', 'thorax', 'abdomen'];
export const isWholeBee = (framing) =>
  framing == null ? null
    : CORE_PARTS.every((p) => framing.parts_fully_visible.includes(p));

/**
 * Union any two boxes that overlap. One bee returned as two boxes is a real and recurring
 * failure -- it hit 21 of 1,070 photos (2.0%) -- and it is a no-op on single-box photos.
 * Anything consuming raw model output must merge before using it.
 */
export function mergeBoxes(boxes) {
  const out = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0) continue;
        out[i] = {
          x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
          in_focus: a.in_focus || b.in_focus,
        };
        out.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return out;
}

export const boxArea = (b) => (Math.abs(b.x1 - b.x0) * Math.abs(b.y1 - b.y0)) / 1e6;

/** How many frame edges the box touches. 3-4 is a strong crop signal, independent of the model. */
export const edgesTouched = (b, tol = 15) =>
  (b.x0 <= tol) + (b.y0 <= tol) + (b.x1 >= 1000 - tol) + (b.y1 >= 1000 - tol);

// ---------------------------------------------------------------------------
// View classification: which slate slot does this photo fill?
//
// The general slate (beeatlas-g9f): lateral habitus, dorsal habitus, frontal, wing
// venation. Note that mixes two axes -- three are ANGLES on a whole animal, one is a
// STRUCTURE shown close up. So this asks for both and the slot is derived, rather than
// asking for a slot directly and hoping the model splits the axes the same way we do.
//
// ANGLE IS DECIDED BY SYMMETRY, not by estimating a camera position. Dorsal, ventral and
// frontal are all views ALONG the bee's plane of symmetry; lateral is that plane seen
// EDGE-ON. Peter could not apply "oblique" consistently when it was left undefined, and
// gemma chose it for 10 of 12 photos -- a catch-all swallows the axis. The tie-break
// toward a named view is what keeps that from happening.
// ---------------------------------------------------------------------------

export const VIEW_SCHEMA = {
  type: 'object',
  properties: {
    angle: {
      type: 'string',
      enum: ['dorsal', 'lateral', 'ventral', 'frontal', 'oblique'],
      description: "The camera's viewpoint on the bee, decided by symmetry.",
    },
    subject: {
      type: 'string',
      enum: ['whole-animal', 'head', 'thorax', 'abdomen', 'wing', 'legs', 'other'],
      description: 'What fills the frame. whole-animal when the entire bee is shown.',
    },
    wing_venation_traceable: {
      type: 'boolean',
      description: 'Can individual wing veins and the cells between them be followed?',
    },
  },
  required: ['angle', 'subject', 'wing_venation_traceable'],
  additionalProperties: false,
};

export const VIEW_PROMPT = `This is a photograph of a bee, from a reference collection.

1. ANGLE — the camera's viewpoint on the bee. Five views, each with a POSITIVE test.
   Apply them by asking what you can SEE, not by estimating a camera position.

   dorsal   — you are looking squarely at the BACK. The midline runs down the picture,
              tergite bands cross it symmetrically, wings lie to either side. Left and
              right are mirror images.
   ventral  — squarely at the UNDERSIDE: sternites, and the mouthparts seen from below.
   frontal  — squarely at the FACE, down the bee's long axis. Both eyes and both antennal
              sockets, roughly mirror-image.
   lateral  — a TRUE SIDE PROFILE. You see one side only; the far side is hidden and the
              midline is not visible.
   oblique  — a THREE-QUARTER view: TWO surfaces visible at once, for example the back AND
              one flank, or the face AND one side. The bee is turned away from square.

   OBLIQUE IS A FIRST-CLASS VIEW, not a leftover. Three-quarter views are common in bee
   photography and are often the single most useful view of an animal, because they show
   more of it than any square-on view does. Do not avoid it, and do not treat it as an
   admission of uncertainty.

   WHICH TO CHOOSE: use dorsal, ventral, frontal or lateral only when the bee is presented
   SQUARE-ON to that surface — near-symmetric for the first three, a clean profile for
   lateral. As soon as two surfaces are substantially visible at once, the answer is
   oblique.

2. SUBJECT — what fills the frame. Answer "whole-animal" when the entire bee is present,
   even if partly obscured or with a leg or antenna tip cropped. Name a structure only
   when that structure fills the frame and the rest of the bee is absent.

3. WING_VENATION_TRACEABLE — can individual wing veins, and the cells between them, be
   followed by eye? True only if the venation pattern could be compared against a key.
   A wing that is present but blurred, folded, or overlapping the body is false.`;

/**
 * Map a classification onto a slate slot. Derived rather than asked, so a wrong slot can
 * be traced to which judgement produced it.
 *
 * A photo can serve more than one slot: a lateral habitus with traceable venation is both
 * a lateral habitus and a wing-venation reference. Returning a LIST keeps that, which
 * matters when the slate is a coverage target and photos are scarce.
 */
export function slateSlots(view) {
  if (!view) return [];
  const slots = [];
  const whole = view.subject === 'whole-animal';
  if (whole && view.angle === 'lateral') slots.push('lateral habitus');
  if (whole && view.angle === 'dorsal') slots.push('dorsal habitus');
  if (view.angle === 'frontal' || (!whole && view.subject === 'head')) slots.push('frontal');
  if (view.wing_venation_traceable) slots.push('wing venation');
  return slots;
}

// ---------------------------------------------------------------------------
// Part visibility: score how well each body part is shown, 0-3.
//
// Replaces the single-select `subject` control, which Peter identified as unable to
// express a real photo ("primarily legs, head and thorax, with some abdomen visible") and
// which measured nothing anyway -- 90% accuracy against an 88% baseline.
//
// The ladder is the LEGIBILITY idea from the first day, made ordinal: the top rung means
// the part could be compared against a key, not merely that it is present. Summing the
// scores gives an information-content number, which is Peter's stated reason for
// preferring lateral habitus ("it showed the most body parts") expressed as something a
// machine can compute.
//
// NOTE this does NOT recover the dorsal-vs-lateral distinction -- both show much the same
// parts. Angle and part-visibility are different questions and this answers only the
// second.
// ---------------------------------------------------------------------------

export const PART_KEYS = ['head', 'thorax', 'abdomen', 'wings', 'legs'];

const partScore = (part, detail) => ({
  type: 'integer',
  enum: [0, 1, 2, 3],
  description: `${part}. 0 = not visible. 1 = present but not readable (blurred, edge-on, obscured). 2 = clearly visible, shape and colour readable. 3 = diagnostic detail readable (${detail}).`,
});

export const PARTS_SCHEMA = {
  type: 'object',
  properties: {
    head: partScore('Head', 'facial markings, antennae, eye margins'),
    thorax: partScore('Thorax', 'scutum punctation, hair pattern, scutellum shape'),
    abdomen: partScore('Abdomen', 'tergite banding and punctation'),
    wings: partScore('Wings', 'individual veins and the cells between them'),
    legs: partScore('Legs', 'tibial and tarsal structure, scopa if present'),
  },
  required: ['head', 'thorax', 'abdomen', 'wings', 'legs'],
  additionalProperties: false,
};

export const PARTS_PROMPT = `This is a photograph of a bee, from a reference collection.

Score how well each body part is shown, on this scale:

  0  NOT VISIBLE — absent from the picture, or completely hidden.
  1  PRESENT BUT NOT READABLE — you can tell it is there, but not much else: blurred,
     edge-on, deep in shadow, or obscured by a flower, another body part, or vial plastic.
  2  CLEARLY VISIBLE — shape, proportions and colour can be made out.
  3  DIAGNOSTIC DETAIL READABLE — fine structure could be compared against an
     identification key.

What counts as diagnostic detail differs per part:
  head     facial markings, antennae, eye margins
  thorax   scutum punctation, hair pattern, scutellum shape
  abdomen  tergite banding and punctation
  wings    individual veins and the cells between them
  legs     tibial and tarsal structure, scopa if present

Score what you can actually SEE. A part that is turned away from the camera, or
foreshortened so its structure cannot be judged, is not readable however sharp the photo
is. Be strict about 3: reserve it for detail a person could key from.`;

/** Sum of part scores: how much of the bee this photo actually documents. Max 15. */
export const informationScore = (parts) =>
  parts ? PART_KEYS.reduce((a, k) => a + (Number(parts[k]) || 0), 0) : null;

/**
 * Downscale to 512px, portably.
 *
 * sips ships with macOS and nothing else; maderas (Ubuntu) has vips and ImageMagick. The
 * pipeline needs to run in both places -- the laptop for interactive work, the server for
 * long pulls, where the network is better and a 14-hour job does not block a laptop.
 *
 * vips is preferred over ImageMagick on the server: it streams rather than loading whole
 * images, which matters on a 3 GB box.
 *
 * Fits the LONGEST edge, preserving aspect ratio, so normalized box coordinates stay
 * meaningful across tools.
 */
import { execFileSync } from 'node:child_process';
import { existsSync as _exists } from 'node:fs';

let _downscaler = null;
function pickDownscaler() {
  if (_downscaler) return _downscaler;
  const candidates = [
    { bin: '/usr/bin/sips', build: (src, dst) => ['-Z', '512', '-s', 'format', 'jpeg', src, '--out', dst] },
    { bin: '/usr/bin/vipsthumbnail', build: (src, dst) => [src, '--size', '512x512', '-o', `${dst}[Q=88]`] },
    { bin: '/usr/bin/vips', build: (src, dst) => ['thumbnail', src, dst, '512'] },
    { bin: '/usr/bin/convert', build: (src, dst) => [src, '-resize', '512x512>', '-quality', '88', dst] },
  ];
  _downscaler = candidates.find((c) => _exists(c.bin));
  if (!_downscaler) throw new Error('no downscaler found (looked for sips, vipsthumbnail, vips, convert)');
  return _downscaler;
}

export function downscale(src, dst) {
  const d = pickDownscaler();
  execFileSync(d.bin, d.build(src, dst), { stdio: 'ignore' });
}
export const downscalerName = () => pickDownscaler().bin;

/**
 * Fetch and downscale many photos concurrently.
 *
 * PHOTO-07's <=1 req/sec governs the iNat API (api.inaturalist.org) -- in
 * seed-species-photos.mjs the RateLimiter is wired only into fetchInatPage. Photo FILES
 * come from inaturalist-open-data.s3.amazonaws.com, an AWS Open Data bucket published for
 * bulk access. Applying the API limit to it was my own over-caution and cost 20x: measured
 * 20.8 photos/sec at 8 concurrent versus 1/sec serial, which is 40 minutes rather than 14
 * hours for a full pull.
 *
 * Kept modest at 8. This is someone else's bucket even if it is meant for bulk reads.
 *
 * ORIGINALS ARE OPTIONAL: 50k full-size photos is ~15 GB, and only the 512px copies are
 * ever scored. keepOriginals=false deletes each original after downscaling.
 */
export async function fetchPhotos(items, { concurrency = 8, keepOriginals = true, onProgress } = {}) {
  const { writeFileSync, existsSync, unlinkSync } = await import('node:fs');
  let cursor = 0, got = 0, cached = 0, failed = 0;

  async function worker() {
    while (cursor < items.length) {
      const p = items[cursor++];
      if (existsSync(p.small_path)) { cached++; continue; }
      try {
        const res = await fetch(p.url);
        if (!res.ok) { p.download_error = `HTTP ${res.status}`; failed++; continue; }
        writeFileSync(p.full_path, Buffer.from(await res.arrayBuffer()));
        downscale(p.full_path, p.small_path);
        if (!keepOriginals) { try { unlinkSync(p.full_path); delete p.full_path; } catch {} }
        got++;
        if (onProgress && got % 100 === 0) onProgress({ got, cached, failed, total: items.length });
      } catch (e) {
        p.download_error = String(e).slice(0, 120);
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { got, cached, failed };
}
