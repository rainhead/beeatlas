// iNat photo URL → srcset helper. Lives outside _data/ so _data/photos.js
// can default-export only its data table; Eleventy 3 unwraps a single
// default export but exposes the full module namespace when any named
// export sits alongside it (which would hide the data table behind
// `photos.default` at template time).
//
// Recognized iNat size tokens: square (75 px), small (240 px),
// medium (500 px), large (~1024 px), original. Hero default = medium
// (500w) per Phase 82 D-09. Non-iNat URLs (no recognized size token)
// pass through with srcset=''.

const SIZE_TOKENS = ['square', 'small', 'medium', 'large', 'original'];
const SIZE_RE = new RegExp(`/(${SIZE_TOKENS.join('|')})(\\.[a-zA-Z0-9]+)$`);

// `square` and `large` are returned alongside src/srcset so callers that need a
// specific size directly — gallery thumbnails, the lightbox — can take it
// without re-parsing the srcset string. Both are '' for non-iNat URLs.
export function deriveSrcset(url) {
  if (typeof url !== 'string') return { src: url, srcset: '', square: '', large: '' };
  const m = url.match(SIZE_RE);
  if (!m) return { src: url, srcset: '', square: '', large: '' };
  const ext = m[2];
  const swap = (size) => url.replace(SIZE_RE, `/${size}${ext}`);
  const square = swap('square');
  const small = swap('small');
  const medium = swap('medium');
  return {
    src: medium,
    srcset: `${square} 75w, ${small} 240w, ${medium} 500w`,
    square,
    large: swap('large'),
  };
}
