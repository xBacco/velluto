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
