/**
 * ADR 0033 gate semantics, as executable spec (beeatlas-r2u). The dbt trusted-taxon model
 * (beeatlas-xs1) carries the same cases as dbt tests; if one changes, change both.
 */
import { describe, it, expect } from 'vitest';
import {
  parseExpertRoster, loadExpertLogins, loadSynonyms, parseCsv, canonicalize,
  identStance, observationTrust,
} from './trust-gate.mjs';

// iNat taxon ids used throughout: Bombus 52779, B. fervidus 143854, B. californicus 143853,
// B. flavifrons 121517, Neolarra 176755, N. californica 428602, Apidae 47221, Diptera 47822.
// Values are real but the tests only rely on the RELATIONSHIPS encoded in ancestor_ids here.
const BOMBUS = 52779, FERVIDUS = 143854, CALIFORNICUS = 143853, FLAVIFRONS = 121517;
const NEOLARRA = 176755, N_CALIFORNICA = 428602, APIDAE = 47221, DIPTERA = 47822;
const ANC_BOMBUS_SP = [48460, 47221, BOMBUS];      // ancestors of a Bombus species (incl. Apidae)
const ANC_NEOLARRA_SP = [48460, APIDAE, NEOLARRA]; // ancestors of a Neolarra species
const EXPERTS = new Set(['johnascher', 'zportman']);

const ident = (login, taxon_id, name, ancestor_ids, extra = {}) =>
  ({ login, taxon_id, name, ancestor_ids, current: true, ...extra });

const gate = (idents, queryTaxonId, queryName, queryAncestorIds = [], synonyms = new Map()) =>
  observationTrust(idents, { expertLogins: EXPERTS, synonyms, queryTaxonId, queryName, queryAncestorIds });

describe('expert roster parsing', () => {
  it('extracts logins from the EXPERTS block, dropping comments and blanks', () => {
    const sh = `#!/bin/bash\nEXPERTS=(\n  johnascher        # John S. Ascher\n  swisschick        # Karla Salp\n  hadel\n)\nOTHER=(x)\n`;
    expect(parseExpertRoster(sh)).toEqual(new Set(['johnascher', 'swisschick', 'hadel']));
  });

  it('parses the real roster file and finds the known members', () => {
    const roster = loadExpertLogins();
    for (const login of ['johnascher', 'swisschick', 'nmdg', 'zportman']) expect(roster).toContain(login);
    expect(roster.size).toBeGreaterThanOrEqual(15);
  });

  /**
   * TRANSITION GUARD (beeatlas-16m): the identifier register seed is the authority on
   * expert status, but the export script's EXPERTS array cannot yet derive from it — so
   * until it does, every roster login must appear in the register with is_expert=true.
   * Editing one without the other fails here, at npm test, instead of silently splitting
   * the two expert lists.
   */
  it('every roster login has an is_expert=true row in the identifier register', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const { ROOT } = await import('./config.mjs');
    const rows = parseCsv(readFileSync(path.join(ROOT, 'data', 'dbt', 'seeds', 'identifier_register.csv'), 'utf8')).slice(1);
    const expertLoginsInRegister = new Set(rows.filter((r) => r[3] === 'true' && r[2]).map((r) => r[2]));
    for (const login of loadExpertLogins()) expect(expertLoginsInRegister).toContain(login);
  });
});

describe('synonym folding', () => {
  it('parses quoted CSV fields with embedded commas', () => {
    expect(parseCsv('a,b,"c, with comma"\n"q""q",r,s')).toEqual([['a', 'b', 'c, with comma'], ['q"q', 'r', 's']]);
  });

  it('the real seeds fold Bombus californicus into fervidus', () => {
    const syn = loadSynonyms();
    expect(canonicalize('Bombus californicus', syn)).toBe('bombus fervidus');
    expect(canonicalize('bombus fervidus', syn)).toBe('bombus fervidus');
  });
});

describe('identStance — compatibility is rank-scoped and synonym-aware', () => {
  const syn = new Map([['bombus californicus', 'bombus fervidus']]);

  it('exact taxon supports', () => {
    expect(identStance(ident('x', FERVIDUS, 'Bombus fervidus', ANC_BOMBUS_SP),
      { queryTaxonId: FERVIDUS, queryName: 'bombus fervidus', synonyms: syn, queryAncestorIds: [APIDAE, BOMBUS] })).toBe('supports');
  });

  it('finer-rank ID within the query taxon is agreement, not conflict', () => {
    expect(identStance(ident('x', N_CALIFORNICA, 'Neolarra californica', ANC_NEOLARRA_SP),
      { queryTaxonId: NEOLARRA, queryName: 'neolarra', synonyms: syn, queryAncestorIds: [APIDAE] })).toBe('supports');
  });

  it('a synonym of the query taxon supports (fervidus/californicus)', () => {
    expect(identStance(ident('x', CALIFORNICUS, 'Bombus californicus', ANC_BOMBUS_SP),
      { queryTaxonId: FERVIDUS, queryName: 'bombus fervidus', synonyms: syn, queryAncestorIds: [APIDAE, BOMBUS] })).toBe('supports');
  });

  it('a coarser ID on the query lineage neither supports nor vetoes', () => {
    expect(identStance(ident('x', APIDAE, 'Apidae', [48460]),
      { queryTaxonId: NEOLARRA, queryName: 'neolarra', synonyms: syn, queryAncestorIds: [48460, APIDAE] })).toBe('coarser');
  });

  it('a disjoint lineage is incompatible', () => {
    expect(identStance(ident('x', DIPTERA, 'Diptera', [48460]),
      { queryTaxonId: NEOLARRA, queryName: 'neolarra', synonyms: syn, queryAncestorIds: [48460, APIDAE] })).toBe('incompatible');
  });
});

describe('observationTrust — expert-trust-with-veto', () => {
  it('Neolarra worked example: one expert genus ID among laypeople → trusted', () => {
    const idents = [
      ident('johnascher', NEOLARRA, 'Neolarra', [48460, APIDAE]),
      ident('random1', NEOLARRA, 'Neolarra', [48460, APIDAE]),
      ident('random2', NEOLARRA, 'Neolarra', [48460, APIDAE]),
    ];
    const t = gate(idents, NEOLARRA, 'neolarra', [48460, APIDAE]);
    expect(t.status).toBe('trusted');
    expect(t.supporters).toEqual(['johnascher']);
  });

  it('only non-expert IDs, however many agree → no-expert (fails the gate)', () => {
    const idents = ['a', 'b', 'c', 'd', 'e'].map((u) => ident(u, NEOLARRA, 'Neolarra', [48460, APIDAE]));
    expect(gate(idents, NEOLARRA, 'neolarra', [48460, APIDAE]).status).toBe('no-expert');
  });

  it('rank-scoped veto: experts disputing the species still agree at genus', () => {
    const idents = [
      ident('johnascher', FERVIDUS, 'Bombus fervidus', ANC_BOMBUS_SP),
      ident('zportman', FLAVIFRONS, 'Bombus flavifrons', ANC_BOMBUS_SP),
    ];
    // genus query: both species IDs support Bombus
    expect(gate(idents, BOMBUS, 'bombus', [48460, APIDAE]).status).toBe('trusted');
    // species query: one supports, the other is disjoint at that depth → vetoed
    const t = gate(idents, FERVIDUS, 'bombus fervidus', [48460, APIDAE, BOMBUS]);
    expect(t.status).toBe('vetoed');
    expect(t.vetoers).toEqual(['zportman']);
  });

  it('a non-expert incompatible ID never vetoes', () => {
    const idents = [
      ident('johnascher', FERVIDUS, 'Bombus fervidus', ANC_BOMBUS_SP),
      ident('driveby', DIPTERA, 'Diptera', [48460]),
    ];
    expect(gate(idents, FERVIDUS, 'bombus fervidus', [48460, APIDAE, BOMBUS]).status).toBe('trusted');
  });

  it('withdrawn (current:false) expert IDs count neither for nor against', () => {
    const idents = [
      ident('johnascher', DIPTERA, 'Diptera', [48460], { current: false }),
      ident('zportman', FERVIDUS, 'Bombus fervidus', ANC_BOMBUS_SP),
    ];
    expect(gate(idents, FERVIDUS, 'bombus fervidus', [48460, APIDAE, BOMBUS]).status).toBe('trusted');
    expect(gate([ident('johnascher', FERVIDUS, 'Bombus fervidus', ANC_BOMBUS_SP, { current: false })],
      FERVIDUS, 'bombus fervidus', [48460, APIDAE, BOMBUS]).status).toBe('no-expert');
  });

  it('a coarser expert ID alone does not satisfy the gate', () => {
    const idents = [ident('johnascher', APIDAE, 'Apidae', [48460])];
    expect(gate(idents, NEOLARRA, 'neolarra', [48460, APIDAE]).status).toBe('no-expert');
  });

  it('synonym agreement satisfies the gate (expert says californicus, page is fervidus)', () => {
    const syn = new Map([['bombus californicus', 'bombus fervidus']]);
    const idents = [ident('johnascher', CALIFORNICUS, 'Bombus californicus', ANC_BOMBUS_SP)];
    expect(gate(idents, FERVIDUS, 'bombus fervidus', [48460, APIDAE, BOMBUS], syn).status).toBe('trusted');
  });

  it('missing identification data is inert, not a failure', () => {
    expect(gate(null, NEOLARRA, 'neolarra').status).toBe('no-data');
    expect(gate(undefined, NEOLARRA, 'neolarra').status).toBe('no-data');
  });
});
