// Species-page photo gallery: main image + thumbnail strip + lightbox.
//
// Progressive enhancement, following the bee-notes island pattern: the
// Nunjucks template bakes one <figure> per photo inside this element, so a
// reader without JS sees every photo with its own attribution. On upgrade we
// read those figures, replace them with the interactive gallery, and keep the
// same CSS classes — styling lives in src/styles/taxon-pages.css, not here.
//
// Light DOM (createRenderRoot returns this) per the taxon-page convention: a
// `static styles` block would be inert, and sharing taxon-pages.css is what
// keeps the baked and rendered markup from diverging.
//
// Deliberately NOT ported from the pnwmoths slideshow this is modelled on:
// OpenSeadragon deep-zoom. BeeAtlas has no tiled image source — iNat's
// `large` is the biggest size available — so the lightbox is a plain <img>.
//
// ARCH-04: must not import mapbox-gl, wa-sqlite, ../sqlite.ts, ../filter.ts,
//   ../bee-map.ts, ../bee-atlas.ts, ../url-state.ts.

import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface GalleryPhoto {
  src: string;
  srcset: string;
  square: string;
  large: string;
  alt: string;
  attribution: string;
  observationUrl: string;
}

@customElement('bee-photo-gallery')
export class BeePhotoGallery extends LitElement {
  @state() private _photos: GalleryPhoto[] = [];
  @state() private _current = 0;
  @state() private _lightboxOpen = false;

  private _inerted: Element[] = [];
  private _boundKeydown = (e: KeyboardEvent) => this._onKeydown(e);
  private _boundAdopt = () => this._adoptBakedFigures();

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this._boundKeydown);
    this._adoptBakedFigures();
    // The HTML parser inserts an element as soon as it reads the start tag, so
    // during initial page parse connectedCallback can fire before any <figure>
    // child exists. Retry once parsing is done. (A deferred module script
    // usually upgrades us after parse, when the first attempt already worked —
    // this is the belt for the case where it doesn't.)
    if (this._photos.length === 0 && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this._boundAdopt, { once: true });
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._boundKeydown);
    document.removeEventListener('DOMContentLoaded', this._boundAdopt);
    this._releaseInert();
  }

  // The baked <figure> elements are this component's input. Lit renders into
  // this same light-DOM root but does NOT clear pre-existing children, so the
  // figures must be removed explicitly or they'd stack above the gallery.
  private _adoptBakedFigures(): void {
    const figures = Array.from(this.querySelectorAll(':scope > figure'));
    if (figures.length === 0) return;

    this._photos = figures.flatMap((fig) => {
      const img = fig.querySelector('img');
      if (!img) return [];
      return [{
        src: img.getAttribute('src') ?? '',
        srcset: img.getAttribute('srcset') ?? '',
        square: img.dataset.square ?? img.getAttribute('src') ?? '',
        large: img.dataset.large ?? img.getAttribute('src') ?? '',
        alt: img.getAttribute('alt') ?? '',
        attribution: img.dataset.attribution ?? '',
        observationUrl: img.dataset.observationUrl ?? '',
      }];
    });

    for (const fig of figures) fig.remove();
  }

  private get _photo(): GalleryPhoto | undefined {
    return this._photos[this._current] ?? this._photos[0];
  }

  private _step(delta: number): void {
    const n = this._photos.length;
    if (n < 2) return;
    this._current = (this._current + delta + n) % n;
  }

  private _onKeydown(e: KeyboardEvent): void {
    if (!this._lightboxOpen) return;
    if (e.key === 'Escape') {
      this._closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      this._step(-1);
    } else if (e.key === 'ArrowRight') {
      this._step(1);
    }
  }

  // Mark every ancestor's siblings inert so keyboard focus cannot leave the
  // lightbox, without inerting this element (which contains the lightbox).
  private _applyInert(): void {
    let node: Element = this;
    while (node.parentElement && node.parentElement.tagName !== 'BODY') {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '');
          this._inerted.push(sibling);
        }
      }
      node = node.parentElement;
    }
  }

  private _releaseInert(): void {
    for (const el of this._inerted) el.removeAttribute('inert');
    this._inerted = [];
  }

  private async _openLightbox(): Promise<void> {
    this._lightboxOpen = true;
    this._applyInert();
    await this.updateComplete;
    this.querySelector<HTMLElement>('.lightbox-close')?.focus();
  }

  private _closeLightbox(): void {
    this._lightboxOpen = false;
    this._releaseInert();
    // Return focus to the trigger that opened the overlay.
    void this.updateComplete.then(() => {
      this.querySelector<HTMLElement>('.slide-trigger')?.focus();
    });
  }

  private _renderCaption(photo: GalleryPhoto): TemplateResult {
    return html`
      <figcaption class="attribution gallery-caption">
        <span>${photo.attribution}</span>
        ${photo.observationUrl
          ? html`<a class="gallery-source" href=${photo.observationUrl}>View on iNaturalist →</a>`
          : nothing}
      </figcaption>
    `;
  }

  private _renderLightbox(photo: GalleryPhoto): TemplateResult {
    const many = this._photos.length > 1;
    return html`
      <div
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Full-size photo"
        @click=${(e: MouseEvent) => { if (e.target === e.currentTarget) this._closeLightbox(); }}
      >
        <img src=${photo.large || photo.src} alt=${photo.alt}>
        ${many ? html`
          <button class="lightbox-prev" aria-label="Previous photo" @click=${() => this._step(-1)}>&#x276E;</button>
          <button class="lightbox-next" aria-label="Next photo" @click=${() => this._step(1)}>&#x276F;</button>
        ` : nothing}
        <button class="lightbox-close" aria-label="Close full-size photo" @click=${() => this._closeLightbox()}>&#x2715;</button>
        <p class="lightbox-caption">
          ${photo.attribution}${many ? ` · ${this._current + 1} of ${this._photos.length}` : ''}
        </p>
      </div>
    `;
  }

  render(): unknown {
    const photo = this._photo;
    // Nothing baked (no photos, or markup we didn't recognize): render nothing
    // and let the template's placeholder stand.
    if (!photo) return nothing;

    const many = this._photos.length > 1;

    return html`
      <figure class="hero-photo gallery" role="group" aria-label="Species photos">
        <button
          class="slide-trigger"
          aria-label="View full-size photo"
          @click=${() => this._openLightbox()}
        >
          <img
            class="photo-hero"
            src=${photo.src}
            srcset=${photo.srcset || nothing}
            sizes="(min-width: 768px) 50vw, 100vw"
            alt=${photo.alt}
          >
        </button>
        ${this._renderCaption(photo)}
        ${many ? html`
          <div class="thumb-strip" role="group" aria-label="Choose a photo">
            ${this._photos.map((p, i) => html`
              <button
                class="thumb"
                aria-current=${i === this._current ? 'true' : 'false'}
                aria-label=${`Photo ${i + 1} of ${this._photos.length}`}
                @click=${() => { this._current = i; }}
              ><img src=${p.square || p.src} alt="" loading="lazy" width="60" height="60"></button>
            `)}
          </div>
        ` : nothing}
      </figure>
      ${this._lightboxOpen ? this._renderLightbox(photo) : nothing}
    `;
  }
}
