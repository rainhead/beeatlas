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

/** Must match scripts/validate-species.mjs. A swap that fails validation is worse than none. */
export const LICENSE_WHITELIST = new Set(['cc0', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc-by-nc-sa']);

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
