import { describe, test, expect } from 'vitest';
// @ts-expect-error -- .js source has no .d.ts; the named export is the contract
import { renderScope } from '../../lib/render-scope.js';

// beeatlas-4oa: a note publish renders only the species pages whose notes moved.
// The env contract is the whole safety story, so it is asserted directly rather
// than through a build: PRESENCE selects a scoped render, absence a full one, and
// the two must never be confused. An unset var read as "scope to zero species"
// would publish nothing; an empty var read as "render everything" would spend the
// full build the scoping exists to avoid.

describe('lib/render-scope.js', () => {
  test('unset means a FULL render, not an empty scope', () => {
    expect(renderScope({})).toBeNull();
  });

  test('set-but-empty is a real, empty scope — zero species, not all of them', () => {
    const scope = renderScope({ BEEATLAS_RENDER_KEYS: '' });
    expect(scope).not.toBeNull();
    expect(scope.size).toBe(0);
  });

  test('newline-separated, because a canonical_name contains spaces', () => {
    const scope = renderScope({
      BEEATLAS_RENDER_KEYS: 'agapostemon virescens\nbombus mixtus',
    });
    expect(scope.has('agapostemon virescens')).toBe(true);
    expect(scope.has('bombus mixtus')).toBe(true);
    expect(scope.size).toBe(2);
  });

  test('blank lines are dropped, so a trailing newline is not a phantom key', () => {
    const scope = renderScope({ BEEATLAS_RENDER_KEYS: 'apis mellifera\n\n' });
    expect([...scope]).toEqual(['apis mellifera']);
  });

  test('a comma-separated list is NOT split — commas are legal in a key', () => {
    // Guards the convention against drifting to the more familiar comma form:
    // Stelis emits newline-separated keys (STELIS_REBUILD_KEYS, st-pd1), and
    // silently accepting commas would turn one key into two non-existent ones.
    const scope = renderScope({ BEEATLAS_RENDER_KEYS: 'a,b' });
    expect([...scope]).toEqual(['a,b']);
  });
});
