import { test, expect, describe, beforeEach } from 'vitest';

// bee-photo-gallery upgrades a baked <figure> stack into a strip + lightbox.
// The baked markup IS the component's input, so every test mounts it the way
// _pages/species-detail.njk emits it.

const PHOTO = (i: number, opts: { attribution?: string; obs?: number } = {}) => `
  <figure class="hero-photo">
    <img class="photo-hero"
      src="https://example.test/photos/${i}/medium.jpg"
      srcset="https://example.test/photos/${i}/square.jpg 75w, https://example.test/photos/${i}/medium.jpg 500w"
      data-square="https://example.test/photos/${i}/square.jpg"
      data-large="https://example.test/photos/${i}/large.jpg"
      ${opts.attribution ? `data-attribution="${opts.attribution}"` : ''}
      ${opts.obs ? `data-observation-url="https://www.inaturalist.org/observations/${opts.obs}"` : ''}
      alt="Photo ${i}">
    ${opts.attribution ? `<figcaption class="attribution">${opts.attribution}</figcaption>` : ''}
  </figure>`;

// Build the subtree detached, then connect it. That mirrors production, where
// the taxon-page module script is deferred and therefore upgrades the element
// after the parser has already given it its <figure> children. Setting
// document.body.innerHTML directly would instead connect the element before
// its children exist — the hazard covered separately below.
async function mount(inner: string, surrounding = '') {
  await import('../species/photo-gallery.ts');
  document.body.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'taxon-page';
  page.innerHTML = `${surrounding}<bee-photo-gallery>${inner}</bee-photo-gallery>`;
  document.body.appendChild(page);
  const el = document.querySelector('bee-photo-gallery') as any;
  await el.updateComplete;
  return el;
}

describe('bee-photo-gallery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('reads every baked figure, not just the first', async () => {
    const el = await mount(PHOTO(1) + PHOTO(2) + PHOTO(3));
    expect(el.querySelectorAll('.thumb').length).toBe(3);
  });

  // Lit's light-DOM render does not clear pre-existing children, so the baked
  // figures must be removed or the page shows the stack AND the gallery.
  test('baked figures are consumed, leaving exactly one rendered figure', async () => {
    const el = await mount(PHOTO(1) + PHOTO(2) + PHOTO(3));
    expect(el.querySelectorAll('figure').length).toBe(1);
    expect(el.querySelectorAll('img.photo-hero').length).toBe(1);
  });

  // The HTML parser connects an element before parsing its children, so a
  // non-deferred upgrade would see an empty element and render nothing.
  test('recovers when connected before its children are parsed', async () => {
    await import('../species/photo-gallery.ts');
    const readyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    try {
      document.body.innerHTML = '';
      const el = document.createElement('bee-photo-gallery') as any;
      document.body.appendChild(el);          // connects with no children yet
      await el.updateComplete;
      expect(el.querySelector('img.photo-hero')).toBeNull();

      el.insertAdjacentHTML('beforeend', PHOTO(1) + PHOTO(2));  // parser catches up
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await el.updateComplete;

      expect(el.querySelectorAll('.thumb').length).toBe(2);
      expect(el.querySelectorAll('figure').length).toBe(1);
    } finally {
      Object.defineProperty(document, 'readyState', readyState ?? { value: 'complete', configurable: true });
    }
  });

  test('single photo renders no thumbnail strip', async () => {
    const el = await mount(PHOTO(1));
    expect(el.querySelector('.thumb-strip')).toBeNull();
    expect(el.querySelector('img.photo-hero')).not.toBeNull();
  });

  test('no recognizable figures: renders nothing so the placeholder stands', async () => {
    const el = await mount('');
    expect(el.querySelector('img')).toBeNull();
  });

  test('clicking a thumbnail swaps the main image and moves aria-current', async () => {
    const el = await mount(PHOTO(1) + PHOTO(2) + PHOTO(3));
    const thumbs = el.querySelectorAll('.thumb');

    thumbs[2].click();
    await el.updateComplete;

    expect(el.querySelector('img.photo-hero').getAttribute('src')).toContain('/photos/3/');
    expect(el.querySelectorAll('.thumb')[2].getAttribute('aria-current')).toBe('true');
    expect(el.querySelectorAll('.thumb')[0].getAttribute('aria-current')).toBe('false');
  });

  // Attribution is per-photo: hoisting one caption over all slides would
  // miscredit photographers, which is a licensing problem, not a cosmetic one.
  test('caption and iNat link track the visible slide', async () => {
    const el = await mount(
      PHOTO(1, { attribution: '(c) alice, CC BY', obs: 111 }) +
      PHOTO(2, { attribution: '(c) bob, CC BY-NC', obs: 222 }),
    );

    expect(el.querySelector('.gallery-caption').textContent).toContain('(c) alice, CC BY');
    expect(el.querySelector('.gallery-source').getAttribute('href'))
      .toBe('https://www.inaturalist.org/observations/111');

    el.querySelectorAll('.thumb')[1].click();
    await el.updateComplete;

    expect(el.querySelector('.gallery-caption').textContent).toContain('(c) bob, CC BY-NC');
    expect(el.querySelector('.gallery-source').getAttribute('href'))
      .toBe('https://www.inaturalist.org/observations/222');
  });

  test('a photo without an observation id renders no source link', async () => {
    const el = await mount(PHOTO(1, { attribution: '(c) alice, CC BY' }));
    expect(el.querySelector('.gallery-source')).toBeNull();
  });

  test('lightbox opens on the main image, shows the large size, and closes on Escape', async () => {
    const el = await mount(PHOTO(1, { attribution: '(c) alice, CC BY' }) + PHOTO(2));

    el.querySelector('.slide-trigger').click();
    await el.updateComplete;

    const lightbox = el.querySelector('.lightbox');
    expect(lightbox).not.toBeNull();
    expect(lightbox.getAttribute('aria-modal')).toBe('true');
    expect(lightbox.querySelector('img').getAttribute('src')).toContain('/photos/1/large.jpg');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await el.updateComplete;
    expect(el.querySelector('.lightbox')).toBeNull();
  });

  test('arrow keys step slides only while the lightbox is open', async () => {
    const el = await mount(PHOTO(1) + PHOTO(2) + PHOTO(3));

    // Closed: arrows must not hijack the page.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await el.updateComplete;
    expect(el.querySelector('img.photo-hero').getAttribute('src')).toContain('/photos/1/');

    el.querySelector('.slide-trigger').click();
    await el.updateComplete;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await el.updateComplete;
    expect(el.querySelector('.lightbox img').getAttribute('src')).toContain('/photos/2/large.jpg');

    // Wraps backwards past the first slide.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await el.updateComplete;
    expect(el.querySelector('.lightbox img').getAttribute('src')).toContain('/photos/3/large.jpg');
  });

  test('lightbox inerts page siblings and releases them on close', async () => {
    const el = await mount(PHOTO(1), '<h1>Bombus fervidus</h1>');
    const heading = document.querySelector('h1')!;

    el.querySelector('.slide-trigger').click();
    await el.updateComplete;
    expect(heading.hasAttribute('inert')).toBe(true);

    el.querySelector('.lightbox-close').click();
    await el.updateComplete;
    expect(heading.hasAttribute('inert')).toBe(false);
  });

  test('disconnecting while the lightbox is open releases inert', async () => {
    const el = await mount(PHOTO(1), '<h1>Bombus fervidus</h1>');
    const heading = document.querySelector('h1')!;

    el.querySelector('.slide-trigger').click();
    await el.updateComplete;
    expect(heading.hasAttribute('inert')).toBe(true);

    el.remove();
    expect(heading.hasAttribute('inert')).toBe(false);
  });
});
