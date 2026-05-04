// Phase 80 Wave 0 — RED contract for D-05.
// Pitfall 1 mitigation: someone "completing" the class by adding render()
// would clobber server-rendered children. Default render() returns noChange,
// which lit-html commits as a no-op (verified in lit-element source).

import { describe, test, expect } from 'vitest';
import { LitElement } from 'lit';
import { BeeSpeciesCard } from '../species/bee-species-card.ts';

describe('bee-species-card (D-05)', () => {
  test('does NOT override render() — preserves Eleventy SSR children', () => {
    expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render);
  });

  test('createRenderRoot returns this (light DOM)', () => {
    const fakeHost = {} as HTMLElement;
    expect(BeeSpeciesCard.prototype.createRenderRoot.call(fakeHost)).toBe(fakeHost);
  });
});
