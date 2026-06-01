// Funzioni pure: nessun I/O, nessuna dipendenza. Dati in → dati out.

export function sortByRecent(rows) {
  return [...rows].sort((a, b) => new Date(b.creato) - new Date(a.creato));
}

export function filterDesideri(rows, { tipo, me }) {
  let out = rows;
  if (tipo === 'da_provare') out = out.filter(d => d.stato === 'da_provare');
  else if (tipo === 'realizzato') out = out.filter(d => d.stato === 'realizzato');
  else if (tipo === 'mine') out = out.filter(d => d.autore_id === me);
  return sortByRecent(out);
}

// ---- CALENDARIO / ESPERIENZE (pure) ----

// Griglia del mese come array di settimane (lun→dom). Ogni cella: {day,iso} oppure null.
export function monthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // lun=0 … dom=6
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(year, month) {
  const nomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return `${nomi[month]} ${year}`;
}

export function groupByDay(rows) {
  const m = {};
  for (const r of rows) (m[r.data] ||= []).push(r);
  return m;
}

export function sortByDateDesc(rows) {
  return [...rows].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

export function fiammeLabel(voto) {
  const v = Math.max(0, Math.min(5, voto | 0));
  return '🔥'.repeat(v) + '🤍'.repeat(5 - v);
}

// ---- TIPI di momento (editabili per coppia) ----
// Default seminati alla prima apertura della coppia.
export const TIPI_DEFAULT = [
  { emoji: '🌶️', label: 'Scopata' },
  { emoji: '🍑', label: 'Anale' },
  { emoji: '🫦', label: 'Pompino' },
  { emoji: '👅', label: 'Leccata' },
];

// Righe pronte per l'insert (con ordine = posizione).
export function tipiDefaultRows(coupleId) {
  return TIPI_DEFAULT.map((t, i) => ({ couple_id: coupleId, emoji: t.emoji, label: t.label, ordine: i }));
}

// Tipo per id, con fallback per eventi senza tipo (o tipo eliminato).
export function findTipo(tipi, id) {
  return tipi.find(t => t.id === id) || { emoji: '✦', label: 'Evento' };
}

// Un'esperienza senza titolo è un "momento rapido" (creato dal tally); con titolo è un evento ricco.
export function isMomentoRapido(e) {
  return !e.titolo;
}

// Quante esperienze di un tipo in una certa data (badge del tally "Segna al volo").
export function countTipoOnDate(events, tipoId, iso) {
  return events.filter(e => e.tipo_id === tipoId && e.data === iso).length;
}

// Divide gli eventi di un giorno: card ricche (con titolo) + conteggi dei momenti rapidi per tipo,
// nell'ordine dei tipi. `conteggi` = [{ tipo, n }].
export function splitGiorno(events, tipi) {
  const ricchi = events.filter(e => !isMomentoRapido(e));
  const counts = {};
  for (const e of events) if (isMomentoRapido(e)) counts[e.tipo_id] = (counts[e.tipo_id] || 0) + 1;
  const conteggi = tipi.filter(t => counts[t.id]).map(t => ({ tipo: t, n: counts[t.id] }));
  return { ricchi, conteggi };
}

// Path deterministico nel bucket 'foto'. `now` iniettabile per i test.
export function fotoPath(coupleId, contesto, refId, filename, now = Date.now()) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${coupleId}/${contesto}/${refId}/${now}-${safe}`;
}

export function groupFotoByContesto(rows) {
  const m = {};
  for (const r of rows) (m[r.contesto] ||= []).push(r);
  return m;
}

// ---- BUONI (pure) ----
// Ritorna la patch da applicare alla riga buono, o lancia se la transizione è illegale.
// `nowISO` iniettabile per i test.
export function applicaTransizioneBuono(buono, azione, nowISO = () => new Date().toISOString()) {
  if (azione === 'riscatta') {
    if (buono.stato !== 'attivo') throw new Error('Solo un buono attivo può essere riscattato');
    return { stato: 'riscattato', riscattato_il: nowISO() };
  }
  if (azione === 'accetta') {
    if (buono.tipo !== 'richiesta' || buono.stato !== 'in_attesa')
      throw new Error('Solo una richiesta in attesa può essere accettata');
    return { tipo: 'regalo', stato: 'attivo' };
  }
  if (azione === 'rifiuta') {
    if (buono.tipo !== 'richiesta' || buono.stato !== 'in_attesa')
      throw new Error('Solo una richiesta in attesa può essere rifiutata');
    return { stato: 'rifiutato' };
  }
  throw new Error('Azione sconosciuta: ' + azione);
}

// Raggruppa i buoni: i singoli (bundle_id null) restano gruppi da uno; quelli con
// stesso bundle_id finiscono insieme. Ordine di prima apparizione preservato.
export function gruppoBundle(buoni) {
  const groups = [];
  const byBundle = {};
  for (const b of buoni) {
    if (!b.bundle_id) { groups.push({ bundle_id: null, buoni: [b] }); continue; }
    if (!byBundle[b.bundle_id]) { byBundle[b.bundle_id] = { bundle_id: b.bundle_id, buoni: [] }; groups.push(byBundle[b.bundle_id]); }
    byBundle[b.bundle_id].buoni.push(b);
  }
  return groups;
}

// ---- DADI (puri) ----
// Tre dadi: az=azione, co=corpo, lu=dove. Sei facce ciascuno.
export const DADI_ORDER = ['az', 'co', 'lu'];
export const DADI_LABEL = { az: 'Azione', co: 'Corpo', lu: 'Dove' };
export const DADI_CHIP = { az: '💋', co: '🫦', lu: '📍' };
export const DADI_DEFAULT = {
  az: [{ e: '💋', t: 'Bacia' }, { e: '👅', t: 'Lecca' }, { e: '🫦', t: 'Mordi' },
       { e: '💆', t: 'Massaggia' }, { e: '✋', t: 'Sfiora' }, { e: '💨', t: 'Soffia su' }],
  co: [{ e: '👄', t: 'il collo' }, { e: '👂', t: "l'orecchio" }, { e: '🦵', t: "l'interno coscia" },
       { e: '🍑', t: 'il lato B' }, { e: '🫀', t: 'il petto' }, { e: '🤚', t: 'la schiena' }],
  lu: [{ e: '🛋️', t: 'sul divano' }, { e: '🚿', t: 'sotto la doccia' }, { e: '🍳', t: 'in cucina' },
       { e: '🚗', t: 'in macchina' }, { e: '🛏️', t: 'a letto' }, { e: '🌃', t: 'sul balcone' }],
};

// Righe DB piatte → { az:[6 facce ordinate], co:[...], lu:[...] }.
export function raggruppaFacce(rows) {
  const out = { az: [], co: [], lu: [] };
  for (const r of rows) if (out[r.dado]) out[r.dado].push(r);
  for (const k of DADI_ORDER) out[k].sort((a, b) => a.ordine - b.ordine);
  return out;
}

// Righe default (piatte) per il seeding di una coppia: 3 dadi × 6 facce = 18 righe.
export function facceDefaultRows(coupleId) {
  const rows = [];
  for (const dado of DADI_ORDER)
    DADI_DEFAULT[dado].forEach((f, i) => rows.push({ couple_id: coupleId, dado, ordine: i, emoji: f.e, testo: f.t }));
  return rows;
}

// Tira i dadi attivi. `rnd` (∈[0,1)) iniettabile. Ritorna {dado: indice 0–5} solo per gli attivi.
export function tiraDadi(attivi, rnd = Math.random) {
  const picks = {};
  for (const k of DADI_ORDER) if (attivi[k]) picks[k] = Math.floor(rnd() * 6);
  return picks;
}

// Compone la frase dal tiro: facce raggruppate + picks → { emos:[…], act, rest:[…] }.
// L'azione fa da verbo; se il dado azione è spento, il primo "resto" diventa verbo.
export function componiFrase(facce, picks) {
  const emos = [], rest = [];
  let act = '';
  for (const k of DADI_ORDER) {
    if (picks[k] == null) continue;
    const f = facce[k] && facce[k][picks[k]];
    if (!f) continue;
    emos.push(f.emoji);
    if (k === 'az') act = f.testo; else rest.push(f.testo);
  }
  if (!act) act = rest.shift() || '';
  return { emos, act, rest };
}

// ---- DATI / STATISTICHE (pure) ----
// Tutto derivato dalle esperienze; nessuna tabella nuova. `todayISO` ('YYYY-MM-DD') iniettabile.

const NOMI_MESE = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export function nomeMese(month) {
  return NOMI_MESE[month];
}

// Filtra per periodo: 'sempre' = tutto, 'mese' = stesso mese (YYYY-MM) di oggi. Salta gli eventi senza data.
export function filtraPeriodo(events, periodo, todayISO) {
  const conData = events.filter(e => e.data);
  if (periodo === 'sempre') return conData;
  const m = todayISO.slice(0, 7);
  return conData.filter(e => e.data.slice(0, 7) === m);
}

// Conteggio per tipo nel set dato → [{tipo, n}] nell'ordine dei tipi (tipi senza eventi restano a 0).
export function conteggioPerTipo(events, tipi) {
  return tipi.map(t => ({ tipo: t, n: events.filter(e => e.tipo_id === t.id).length }));
}

// Mappa { iso: numero eventi }. Salta gli eventi senza data.
export function conteggiGiornalieri(events) {
  const m = {};
  for (const e of events) if (e.data) m[e.data] = (m[e.data] || 0) + 1;
  return m;
}

// Giorni consecutivi (fino a oggi incluso) con almeno un evento.
export function streakAttuale(events, todayISO) {
  const counts = conteggiGiornalieri(events);
  let streak = 0;
  const d = new Date(todayISO + 'T00:00:00Z');
  while (counts[d.toISOString().slice(0, 10)]) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

// Giorno record { iso, n } col massimo di eventi. `prefisso` ('YYYY-MM') opzionale per limitare al mese.
export function giornoRecord(events, prefisso = null) {
  const counts = conteggiGiornalieri(events);
  let best = 0, bestIso = null;
  for (const [iso, n] of Object.entries(counts)) {
    if (prefisso && iso.slice(0, 7) !== prefisso) continue;
    if (n > best) { best = n; bestIso = iso; }
  }
  return { iso: bestIso, n: best };
}

// Sotto-categorie hardcoded (match per etichetta, case-insensitive): un figlio conta nel record
// del padre e ha anche un suo record a parte. Es. un'anale è comunque una scopata.
export const SOTTO_CATEGORIE = { scopata: ['anale'] };

// Dai tipi della coppia ricava le relazioni padre→figlio secondo SOTTO_CATEGORIE.
// → { figliDi: {parentId: [tipoFiglio]}, figlioIds: Set(idFiglio) }.
export function relazioniTipi(tipi) {
  const byLabel = {};
  for (const t of tipi) byLabel[(t.label || '').trim().toLowerCase()] = t;
  const figliDi = {};
  const figlioIds = new Set();
  for (const [padreL, figliL] of Object.entries(SOTTO_CATEGORIE)) {
    const padre = byLabel[padreL];
    if (!padre) continue;
    for (const fl of figliL) {
      const figlio = byLabel[fl];
      if (!figlio) continue;
      (figliDi[padre.id] ||= []).push(figlio);
      figlioIds.add(figlio.id);
    }
  }
  return { figliDi, figlioIds };
}

// Record combinato padre+figli: giorno col massimo di eventi del padre e dei suoi figli messi insieme.
// → { iso, n, perFiglio: {childId: n nel giorno record} }.
export function giornoRecordCombinato(events, parentId, childIds) {
  const ids = new Set([parentId, ...childIds]);
  const counts = {};
  const perDay = {};
  for (const e of events) {
    if (!e.data || !ids.has(e.tipo_id)) continue;
    counts[e.data] = (counts[e.data] || 0) + 1;
    if (childIds.includes(e.tipo_id)) {
      (perDay[e.data] ||= {});
      perDay[e.data][e.tipo_id] = (perDay[e.data][e.tipo_id] || 0) + 1;
    }
  }
  let best = 0, bestIso = null;
  for (const [iso, n] of Object.entries(counts)) if (n > best) { best = n; bestIso = iso; }
  return { iso: bestIso, n: best, perFiglio: bestIso ? (perDay[bestIso] || {}) : {} };
}

// Plurale italiano "buono abbastanza" per le etichette dei tag: anale→anali, scopata→scopate, pompino→pompini.
export function pluralizzaIt(parola) {
  const w = (parola || '').trim();
  if (/a$/i.test(w)) return w.slice(0, -1) + 'e';
  if (/[eo]$/i.test(w)) return w.slice(0, -1) + 'i';
  return w;
}

// Media a settimana nel periodo. 'mese' = giorni trascorsi del mese / 7; 'sempre' = span dal primo evento a oggi.
export function mediaSettimanale(eventsPeriodo, allEvents, periodo, todayISO) {
  const n = eventsPeriodo.length;
  if (!n) return 0;
  let settimane;
  if (periodo === 'mese') {
    settimane = Number(todayISO.slice(8, 10)) / 7;
  } else {
    const dates = Object.keys(conteggiGiornalieri(allEvents)).sort();
    if (!dates.length) return 0;
    const span = (new Date(todayISO + 'T00:00:00Z') - new Date(dates[0] + 'T00:00:00Z')) / 6048e5;
    settimane = span;
  }
  return n / Math.max(settimane, 1);
}

// Array lungo i giorni del mese corrente, con il conteggio di eventi per ciascun giorno.
export function perGiornoDelMese(events, todayISO) {
  const [y, m] = todayISO.split('-').map(Number);
  const giorni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefisso = todayISO.slice(0, 7);
  const arr = new Array(giorni).fill(0);
  for (const e of events) {
    if (!e.data || e.data.slice(0, 7) !== prefisso) continue;
    const d = Number(e.data.slice(8, 10));
    if (d >= 1 && d <= giorni) arr[d - 1]++;
  }
  return arr;
}

export function buoniRicevuti(buoni, me) {
  return buoni.filter(b => b.a_id === me && b.tipo === 'regalo');
}
export function buoniInviati(buoni, me) {
  return buoni.filter(b => b.da_id === me && b.tipo === 'regalo');
}
export function richiesteDaConcedere(buoni, me) {
  return buoni.filter(b => b.tipo === 'richiesta' && b.stato === 'in_attesa' && b.da_id === me);
}
export function richiesteInviate(buoni, me) {
  return buoni.filter(b => b.tipo === 'richiesta' && b.stato === 'in_attesa' && b.a_id === me);
}

// Segreti (buste sigillate) ancora da aprire ricevuti da `me`.
// NB: 'segreto' non è ancora un tipo valido nel check constraint di `buoni`
// (oggi solo 'regalo'/'richiesta'), quindi finché i segreti non sono implementati
// questa ritorna [] e la fetta 💋 della ruota resta spenta. Nessun crash.
export function segretiDaRivelare(buoni, me) {
  return (buoni || []).filter(b => b.tipo === 'segreto' && b.a_id === me && b.stato === 'attivo');
}

// ---- ECONOMIA A GIRI (pure) ----
export const ECONOMIA = {
  GRATIS_OGNI_GIORNI: 7,   // ogni quanto matura il giro gratis settimanale
  COSTO_GIRO: 1,           // giri spesi per girare
  GIRI_PER_VITTORIA: 1,    // PROVVISORIO: accreditati vincendo un gioco (hook concediGiro)
  ULTIMI_PREMI: 5,         // voci dello storico "Ultimi premi"
};

// Economia slot (Fase 4b, 2026-05-28). Indipendente dalla ruota.
export const ECONOMIA_SLOT = {
  COSTO_TIRO: 1,
  GRATIS_OGNI_GIORNI: 7,
  TIRI_SETTIMANALI: 5,
  CAP_SALDO: 10,
};

// Time-to-live per buoni "lampo" (🎟️) e "polaroid" (📸). Ambedue 24h.
export const LAMPO_TTL_MS    = 24 * 60 * 60 * 1000;
export const POLAROID_TTL_MS = 24 * 60 * 60 * 1000;

// Quanti tiri si possono davvero accreditare senza superare il cap.
// Ritorna l'incremento effettivo (>=0). Eccedenza scartata.
export function accreditoConCap(saldo, delta, cap) {
  if (delta <= 0) return 0;
  return Math.max(0, Math.min(delta, cap - saldo));
}

// Saldo slot dell'utente (ledger insert-only, somma dei delta).
export function saldoSlot(movimenti, userId) {
  return movimenti.filter(m => m.user_id === userId).reduce((s, m) => s + m.delta, 0);
}

// Settimanale slot: ok se mai maturato o se passati ECONOMIA_SLOT.GRATIS_OGNI_GIORNI dall'ultimo.
// `now` (Date) iniettabile per i test.
export function slotEleggibile(movimenti, userId, now = new Date()) {
  const settimanali = movimenti
    .filter(m => m.user_id === userId && m.motivo === 'settimanale')
    .map(m => new Date(m.creato))
    .sort((a, b) => b - a);
  if (!settimanali.length) return { ok: true, prossimoSblocco: null };
  const prossimo = new Date(settimanali[0].getTime() + ECONOMIA_SLOT.GRATIS_OGNI_GIORNI * 864e5);
  return { ok: now >= prossimo, prossimoSblocco: prossimo.toISOString() };
}

// Saldo = somma dei delta dei movimenti dell'utente (ledger insert-only).
export function saldoGiri(movimenti, userId) {
  return movimenti.filter(m => m.user_id === userId).reduce((s, m) => s + m.delta, 0);
}

export function puoGirare(saldo) {
  return saldo >= ECONOMIA.COSTO_GIRO;
}

// Giro gratis settimanale: ok se mai maturato o se passati GRATIS_OGNI_GIORNI dall'ultimo.
// `now` (Date) iniettabile per i test.
export function giriEleggibile(movimenti, userId, now = new Date()) {
  const settimanali = movimenti
    .filter(m => m.user_id === userId && m.motivo === 'settimanale')
    .map(m => new Date(m.creato))
    .sort((a, b) => b - a);
  if (!settimanali.length) return { ok: true, prossimoSblocco: null };
  const prossimo = new Date(settimanali[0].getTime() + ECONOMIA.GRATIS_OGNI_GIORNI * 864e5);
  return { ok: now >= prossimo, prossimoSblocco: prossimo.toISOString() };
}

// ---- RUOTA (fette, estrazione, storico premi) ----

// Le 13 fette, in ordine sulla ruota (dal puntatore in senso orario).
// GEOMETRIA: 13 spicchi UGUALI (360/13 = 27.692°). I pesi NON influenzano la
// larghezza visiva, solo la probabilita' di estrazione (vedi estraiFetta).
// 3 tier di probabilita':
//   - Comuni (peso 1):   6 fette  → 10.00% ciascuna
//   - Medi   (peso 2/3): 5 fette  →  6.67% ciascuna
//   - Rari   (peso 1/3): 2 fette  →  3.33% ciascuna  (cornice oro nel render)
// Somma pesi base = 6×1 + 5×(2/3) + 2×(1/3) = 10. Le condizionali (segreto,
// piccante, desiderio, lampo) azzerano il proprio peso quando manca la
// risorsa, e gli altri salgono in percentuale.
export const FETTE = [
  { key: 'segreto',   emoji: '💋', label: 'Apri un segreto',     peso: 1,    differito: false },
  { key: 'piccante',  emoji: '🔥', label: 'Proposta piccante',   peso: 1,    differito: false },
  { key: 'desiderio', emoji: '💌', label: 'Pesca una fantasia',  peso: 1,    differito: true  },
  { key: 'bendare',   emoji: '🧣', label: 'Bendare',             peso: 1,    differito: false },
  { key: 'wild',      emoji: '🃏', label: 'Carta wild',          peso: 2/3,  differito: false },
  { key: 'massaggio', emoji: '💆', label: 'Massaggio',           peso: 1,    differito: false },
  { key: 'doppio',    emoji: '🪄', label: 'Prossimo ×2',         peso: 1/3,  differito: false, rare: true },
  { key: 'polaroid',  emoji: '📸', label: 'Foto osè 24h',        peso: 2/3,  differito: true  },
  { key: 'lampo',     emoji: '🎟️', label: 'Buono lampo',         peso: 2/3,  differito: true  },
  { key: 'orale',     emoji: '👅', label: 'Servizio orale',      peso: 2/3,  differito: false },
  { key: 'ancora',    emoji: '🔁', label: 'Gira ancora',         peso: 1,    differito: false },
  { key: 'jolly',     emoji: '⭐', label: 'Jolly: scegli tu',    peso: 2/3,  differito: false },
  { key: 'jackpot',   emoji: '💎', label: 'Jackpot',             peso: 1/3,  differito: false, rare: true },
];

// Copia di FETTE con i pesi delle fette condizionali azzerati quando manca la condizione.
// Le fette restano tutte e 13 (la ruota ha geometria fissa).
// Condizionali: segreto (haSegreti), piccante (haProposte), desiderio (haFantasie), lampo (haBuoni).
export function fetteRuota({ haSegreti, haProposte, haFantasie, haBuoni }) {
  return FETTE.map(f => {
    let peso = f.peso;
    if (f.key === 'segreto'   && !haSegreti)  peso = 0;
    if (f.key === 'piccante'  && !haProposte) peso = 0;
    if (f.key === 'desiderio' && !haFantasie) peso = 0;
    if (f.key === 'lampo'     && !haBuoni)    peso = 0;
    return { ...f, peso };
  });
}

// Effetto del flag persistente "prossimo ×2" su un esito della ruota.
// Ritorna un oggetto con le proprietà raddoppiate, da consumare nel rendering del reveal
// e/o nella creazione dei record differiti (buoni con quantita=2).
//
// Regole:
// - massaggio: 10 → 20 minuti
// - wild: 24h → 48h
// - lampo / polaroid: quantita = 2 (crea due record)
// - segreto / piccante / desiderio: quantita = 2 (apri/pesca due volte)
// - orale: testoExtra "due volte, una ora e una quando vuole chi ha vinto"
// - bendare: cosmeticOnly (label "il doppio del tempo")
// - jolly: deferToJolly (il flag passa allo spicchio scelto dal selettore)
// - ancora / doppio / jackpot: gestiti separatamente nel chiamante (non consumano flag o sono idempotenti)
export function applicaDoppio(esito) {
  const out = { boosted: true };
  switch (esito.key) {
    case 'massaggio':  return { ...out, minuti: 20 };
    case 'wild':       return { ...out, ore: 48 };
    case 'lampo':
    case 'polaroid':   return { ...out, quantita: 2 };
    case 'segreto':
    case 'piccante':
    case 'desiderio':  return { ...out, quantita: 2 };
    case 'orale':      return { ...out, testoExtra: 'Due volte: una ora e una quando vuole chi ha vinto.' };
    case 'bendare':    return { ...out, cosmeticOnly: true };
    case 'jolly':      return { ...out, deferToJolly: true };
    default:           return { ...out };
  }
}

// Estrazione pesata. rnd ∈ [0,1) iniettabile. Salta i pesi 0. null se tutti 0.
export function estraiFetta(fette, rnd = Math.random) {
  const tot = fette.reduce((s, f) => s + f.peso, 0);
  if (tot <= 0) return null;
  let x = rnd() * tot;
  for (let i = 0; i < fette.length; i++) {
    x -= fette[i].peso;
    if (x < 0) return { indice: i, fetta: fette[i] };
  }
  return { indice: fette.length - 1, fetta: fette[fette.length - 1] };
}

// Ultimi n premi (movimenti motivo='giro') dell'utente, recenti prima, con la fetta risolta.
export function ultimiPremi(movimenti, userId, n = ECONOMIA.ULTIMI_PREMI) {
  return movimenti
    .filter(m => m.user_id === userId && m.motivo === 'giro')
    .sort((a, b) => new Date(b.creato) - new Date(a.creato))
    .slice(0, n)
    .map(m => ({ ...m, fetta: FETTE.find(f => f.key === m.esito) || null }));
}

// ---- CONTENUTI RUOTA (default di seeding; la fonte di verità è ruota_contenuti) ----
// Approvati dall'utente il 2026-05-27 (mockups/ruota-contenuti.html). Editabili dall'app.
export const PROPOSTE_PICCANTI_DEFAULT = [
  'Spogliatevi a vicenda, lentamente, senza dire una parola.',
  'Massaggio con l’olio: dieci minuti a testa, niente fretta.',
  'Uno dei due bendato: si lascia guidare solo dal tatto.',
  'Doccia insieme, luci basse.',
  'Chi ha girato detta le regole per i prossimi dieci minuti.',
  'Un bacio lungo un minuto intero — mani dietro la schiena.',
  'Raccontatevi una fantasia che non vi siete mai detti.',
  'Striptease privato: una canzone intera, pubblico di una persona.',
];

export const BUONI_SORPRESA_DEFAULT = [
  { emoji: '💆', titolo: 'Massaggio completo',    descrizione: 'Quindici minuti di massaggio, quando lo riscatti.' },
  { emoji: '🛁', titolo: 'Bagno caldo preparato', descrizione: 'Te lo prepara il partner, candele incluse.' },
  { emoji: '😈', titolo: 'Un sì garantito',       descrizione: 'Una richiesta piccante a tua scelta, senza poter dire di no.' },
  { emoji: '🎬', titolo: 'Serata, scegli tu',     descrizione: 'Film e coccole decisi da te, per una sera.' },
  { emoji: '💋', titolo: 'Tre voglie express',    descrizione: 'Tre piccoli desideri esauditi stasera.' },
  { emoji: '🍳', titolo: 'Colazione a letto',     descrizione: 'Una mattina a tua scelta, te la porta il partner.' },
];

// Righe piatte per seminare ruota_contenuti la prima volta (stile facceDefaultRows/tipiDefaultRows).
export function ruotaContenutiDefaultRows(coupleId) {
  const rows = [];
  PROPOSTE_PICCANTI_DEFAULT.forEach((testo, i) =>
    rows.push({ couple_id: coupleId, categoria: 'piccante', emoji: null, testo, descrizione: null, ordine: i }));
  BUONI_SORPRESA_DEFAULT.forEach((b, i) =>
    rows.push({ couple_id: coupleId, categoria: 'buono', emoji: b.emoji, testo: b.titolo, descrizione: b.descrizione, ordine: i }));
  return rows;
}

export function proposteDa(contenuti) {
  return contenuti.filter(c => c.categoria === 'piccante').sort((a, b) => a.ordine - b.ordine);
}
export function buoniSorpresaDa(contenuti) {
  return contenuti.filter(c => c.categoria === 'buono').sort((a, b) => a.ordine - b.ordine);
}
// Un elemento a caso da una lista; null se vuota. rnd iniettabile.
export function pescaContenuto(lista, rnd = Math.random) {
  if (!lista.length) return null;
  return lista[Math.floor(rnd() * lista.length)];
}

// ============================================================================
// STRIP POKER (Fase 4c) — motore poker puro
// Carta: { r, s } con r 2..14 (11=J,12=Q,13=K,14=A), s 0..3 (0♠ 1♥ 2♦ 3♣).
// ============================================================================

export const CATEGORIE_POKER = [
  'Carta alta', 'Coppia', 'Doppia coppia', 'Tris', 'Scala', 'Colore', 'Full', 'Poker', 'Scala colore',
];

export function mazzo52() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  return d;
}

export function mescola(deck, rnd = Math.random) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}

export function valutaMano(carte5) {
  const rs = carte5.map(c => c.r).sort((a, b) => b - a);
  const flush = carte5.every(c => c.s === carte5[0].s);
  const uniq = rs.filter((v, i) => rs.indexOf(v) === i);
  let straight = false, hi = rs[0];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { straight = true; hi = uniq[0]; }
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) { straight = true; hi = 5; }
  }
  const cnt = {}; rs.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
  const groups = Object.keys(cnt).map(r => [cnt[r], +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const counts = groups.map(g => g[0]);
  const ordered = groups.map(g => g[1]);
  let categoria, tieBreakers;
  if (straight && flush) { categoria = 8; tieBreakers = [hi]; }
  else if (counts[0] === 4) { categoria = 7; tieBreakers = ordered; }
  else if (counts[0] === 3 && counts[1] === 2) { categoria = 6; tieBreakers = ordered; }
  else if (flush) { categoria = 5; tieBreakers = rs; }
  else if (straight) { categoria = 4; tieBreakers = [hi]; }
  else if (counts[0] === 3) { categoria = 3; tieBreakers = ordered; }
  else if (counts[0] === 2 && counts[1] === 2) { categoria = 2; tieBreakers = ordered; }
  else if (counts[0] === 2) { categoria = 1; tieBreakers = ordered; }
  else { categoria = 0; tieBreakers = rs; }
  return { categoria, tieBreakers };
}

export function confronta(a, b) {
  const va = [a.categoria, ...a.tieBreakers];
  const vb = [b.categoria, ...b.tieBreakers];
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const x = va[i] || 0, y = vb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function combinazioni5(carte) {
  const r = [], n = carte.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++)
      r.push([carte[a], carte[b], carte[c], carte[d], carte[e]]);
  return r;
}

export function miglioreManoDa7(carte7) {
  let best = null, bestCarte = null;
  for (const combo of combinazioni5(carte7)) {
    const v = valutaMano(combo);
    if (!best || confronta(v, best) > 0) { best = v; bestCarte = combo; }
  }
  return { categoria: best.categoria, tieBreakers: best.tieBreakers, carte: bestCarte };
}

// ============================================================================
// STRIP POKER — guardaroba e state machine (pura)
// Lista simmetrica: 13 capi a testa. Differenze per sesso solo su capo "sotto"
// (gonna/pantaloncini) e intimo (reggiseno/canottiera). Ordine = dal più esterno
// al più intimo (ordine in cui si tolgono). via:'avatar' = si tocca la zona del
// corpo; via:'chip' = chip a lato (scarpe/calzini, qty 2).
// ============================================================================

export const GUARDAROBA = [
  { k: 'cappello',   n: 'Cappello',   e: '🎩', gruppo: 'Testa',  qty: 1, via: 'avatar', zona: 'head' },
  { k: 'occhiali',   n: 'Occhiali',   e: '🕶️', gruppo: 'Testa',  qty: 1, via: 'avatar', acc: 'occhiali' },
  { k: 'sciarpa',    n: 'Sciarpa',    e: '🧣', gruppo: 'Testa',  qty: 1, via: 'avatar', acc: 'sciarpa' },
  { k: 'giacca',     n: 'Giacca',     e: '🧥', gruppo: 'Sopra',  qty: 1, via: 'avatar', zona: 'torso' },
  { k: 'felpa',      n: 'Felpa',      e: '🧶', gruppo: 'Sopra',  qty: 1, via: 'avatar', zona: 'torso' },
  { k: 'maglietta',  n: 'Maglietta',  e: '👕', gruppo: 'Sopra',  qty: 1, via: 'avatar', zona: 'torso' },
  { k: 'gonna',      n: 'Gonna',      e: '👗', gruppo: 'Sotto',  qty: 1, via: 'avatar', zona: 'legs', sesso: 'lei' },
  { k: 'pantaloncini', n: 'Pantaloncini', e: '🩳', gruppo: 'Sotto', qty: 1, via: 'avatar', zona: 'legs', sesso: 'lui' },
  { k: 'scarpe',     n: 'Scarpe',     e: '👟', gruppo: 'Piedi',  qty: 2, via: 'chip' },
  { k: 'calzini',    n: 'Calzini',    e: '🧦', gruppo: 'Piedi',  qty: 2, via: 'chip' },
  { k: 'mutande',    n: 'Mutande',    e: '🩲', gruppo: 'Intimo', qty: 1, via: 'avatar', zona: 'pelvis' },
  { k: 'reggiseno',  n: 'Reggiseno',  e: '👙', gruppo: 'Intimo', qty: 1, via: 'avatar', zona: 'torso', sesso: 'lei' },
  { k: 'canottiera', n: 'Canottiera', e: '🦺', gruppo: 'Intimo', qty: 1, via: 'avatar', zona: 'torso', sesso: 'lui' },
];

export const GUARDAROBA_META = Object.fromEntries(GUARDAROBA.map(c => [c.k, c]));

export function capiIniziali(sesso) {
  return GUARDAROBA
    .filter(c => !c.sesso || c.sesso === sesso)
    .map(c => ({ k: c.k, qty: c.qty }));
}

export function statoInizialePartita() {
  const build = sesso => {
    const o = {};
    for (const c of capiIniziali(sesso)) o[c.k] = c.qty;
    return o;
  };
  return { lui: build('lui'), lei: build('lei') };
}

export function togliCapo(stato, persona, capoId) {
  const cur = stato[persona];
  if (!cur || !cur[capoId]) return stato;
  const next = { ...cur, [capoId]: cur[capoId] - 1 };
  if (next[capoId] <= 0) delete next[capoId];
  return { ...stato, [persona]: next };
}

export function eNudo(stato, persona) {
  const cur = stato[persona] || {};
  return Object.values(cur).reduce((a, b) => a + b, 0) === 0;
}

export function risultatoPartita(stato) {
  if (eNudo(stato, 'lui')) return { vincitore: 'lei', perdente: 'lui' };
  if (eNudo(stato, 'lei')) return { vincitore: 'lui', perdente: 'lei' };
  return null;
}

export function testaATesta(partite, me, partner) {
  let mie = 0, sue = 0;
  for (const p of partite) {
    if (p.vincitore_id === me) mie++;
    else if (p.vincitore_id === partner) sue++;
  }
  return { mie, sue };
}

// ---- LUOGHI / MAPPA (pure) ----
// data_evento = 'YYYY-MM-DD'. mese ritornato 0..11, oppure null se senza data.
export function meseDi(luogo) {
  return luogo.data_evento ? Number(luogo.data_evento.slice(5, 7)) - 1 : null;
}

// Conteggi per mese: vis = tutti i luoghi, fat = solo intimi. Salta i luoghi senza data.
export function aggregaPerMese(luoghi) {
  const vis = Array(12).fill(0), fat = Array(12).fill(0);
  for (const l of luoghi) {
    const m = meseDi(l);
    if (m == null) continue;
    vis[m]++;
    if (l.intimo) fat[m]++;
  }
  return { vis, fat };
}

export function soloIntimi(luoghi) {
  return luoghi.filter(l => l.intimo);
}

// Totali per le etichette: luoghi totali, volte (= intimi), mesi con almeno un luogo.
export function totaliLuoghi(luoghi) {
  const { vis } = aggregaPerMese(luoghi);
  return {
    luoghi: luoghi.length,
    volte: soloIntimi(luoghi).length,
    mesiAttivi: vis.filter(n => n > 0).length,
  };
}

// Luoghi di un mese (0..11): visited (tutti) + fatto (solo intimi).
export function luoghiDelMese(luoghi, mese) {
  const visited = luoghi.filter(l => meseDi(l) === mese);
  return { visited, fatto: visited.filter(l => l.intimo) };
}

// Voto a cuori per il retro della polaroid.
export function cuoriLabel(voto) {
  const v = Math.max(0, Math.min(5, voto | 0));
  return '❤'.repeat(v) + '♡'.repeat(5 - v);
}

// ---- CALORE di coppia — modello "pavimento + braci recenti" (puro) ----
// Approvato 2026-06-01 (mockups/calore-lab.html, modello A). Filosofia ANTI-ANSIA:
// premia, non punisce. Il calore non si spegne mai sotto il "pavimento", che cresce
// lentamente con la storia della coppia; le "braci" sono il contributo caldo degli
// eventi recenti — sale a ogni gesto e decade dolce dentro la finestra.
//
// Taratura fissata (placeholder calibrati a occhio, DA VERIFICARE sui dati reali).
export const CALORE = {
  pavBase: 50,         // pavimento di partenza (gradi)
  pavMax: 60,          // tetto del pavimento: non sale oltre, per quanto lunga la storia
  pavStep: 0.45,       // quanto alza il pavimento ogni evento della storia
  finestraGiorni: 14,  // un evento contribuisce alle braci finché è in questa finestra (decadimento lineare)
  kA: 15,              // saturazione: più alto = ultimi gradi più duri da conquistare
  Rfull: 50,           // "sforzo-vetta": raw di braci necessario a toccare la vetta
  vetta: 100,          // massimo (gradi)
};

// Pesi placeholder per sorgente-evento (mockups/calore-lab.html, oggetto EV).
// DA VERIFICARE sui dati reali — calibrati a occhio.
export const PESI_CALORE = {
  desiderio: 5, esperienza: 6, buono: 4, foto: 3, luogo: 6, gioco: 2,
};

function clampCalore(lo, x, hi) { return Math.max(lo, Math.min(hi, x)); }
function msDi(quando) { return quando instanceof Date ? quando.getTime() : new Date(quando).getTime(); }

// Calore attuale dagli `eventi` ([{ quando: Date|ISO, peso }]). `now` (Date) iniettabile.
// → { gradi, pavimento, braci }, con gradi ∈ [pavimento, vetta]. Eventi futuri ignorati.
export function calcolaCalore(eventi, now = new Date()) {
  const ora = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const C = CALORE;

  // Il pavimento cresce con il numero di eventi della storia (capato a pavMax).
  const passati = eventi.filter(e => msDi(e.quando) <= ora);
  const pavimento = Math.min(C.pavMax, C.pavBase + passati.length * C.pavStep);

  // Braci: somma pesata degli eventi nella finestra, peso lineare con l'età.
  let raw = 0;
  for (const e of passati) {
    const eta = (ora - msDi(e.quando)) / 864e5; // età in giorni
    if (eta >= C.finestraGiorni) continue;
    raw += e.peso * (1 - eta / C.finestraGiorni);
  }
  // Saturazione normalizzata: concava (ultimi gradi i più duri) ma che TOCCA la vetta
  // quando raw = Rfull. La curva 1-e^(-raw/k) è un asintoto che non arriva mai a 1:
  // la si normalizza dividendo per il suo valore in Rfull, così sat=1 esattamente lì.
  const denom = 1 - Math.exp(-C.Rfull / C.kA);
  const sat = clampCalore(0, (1 - Math.exp(-raw / C.kA)) / denom, 1);
  const braci = (C.vetta - pavimento) * sat;
  const gradi = clampCalore(pavimento, pavimento + braci, C.vetta);
  return { gradi, pavimento, braci };
}

// Etichetta data breve italiana. conGiorno=false → "Ago 2025"; true → "21 ago 2025".
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function etichettaData(iso, { conGiorno = false } = {}) {
  if (!iso) return '';
  const [y, mm, dd] = iso.slice(0, 10).split('-');
  const mese = MESI_BREVI[Number(mm) - 1] || '';
  if (conGiorno) return `${Number(dd)} ${mese} ${y}`;
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${y}`;
}
