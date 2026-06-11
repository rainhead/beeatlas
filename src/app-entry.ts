// Vite entry for the /app route.
// Imports <bee-atlas> (same component as /) plus SW registration.
// _pages/index.html references src/bee-atlas.ts directly and MUST NOT
// import this file — that structural separation is the no-SW-on-/ guarantee.
import './bee-atlas.ts';
import './sw-registration.ts';
