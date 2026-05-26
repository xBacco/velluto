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
