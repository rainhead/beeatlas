const _BASE = (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? 'https://beeatlas.net/data';

interface Manifest {
  occurrences: string;
  species: string;
  seasonality: string;
  counties: string;
  ecoregions: string;
  generated_at: string;
}

let _promise: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  if (!_promise) {
    _promise = fetch(`${_BASE}/manifest.json`)
      .then(r => { if (!r.ok) throw new Error(`manifest.json: ${r.status}`); return r.json() as Promise<Manifest>; });
  }
  return _promise;
}

type DataKey = keyof Omit<Manifest, 'generated_at'>;

export async function resolveDataUrl(key: DataKey): Promise<string> {
  const m = await loadManifest();
  return `${_BASE}/${m[key]}`;
}
