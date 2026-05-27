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

// Record per tipo (di sempre): per ogni tipo il giorno col massimo di eventi di quel tipo.
// → [{tipo, iso, n}] nell'ordine dei tipi (n 0 / iso null se il tipo non ha eventi).
export function recordPerTipo(events, tipi) {
  return tipi.map(t => {
    const rec = giornoRecord(events.filter(e => e.tipo_id === t.id));
    return { tipo: t, iso: rec.iso, n: rec.n };
  });
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
