// Tutte le funzioni ricevono `client` (Supabase) come primo argomento → testabili.
// Nessun fallimento silenzioso: in caso di error si lancia un'eccezione.

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Errore Supabase');
  return data;
}

// ---- DESIDERI ----
export async function listDesideri(client, coupleId) {
  const res = await client.from('desideri').select('*').eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addDesiderio(client, { couple_id, autore_id, testo, categoria }) {
  const res = await client.from('desideri').insert({
    couple_id, autore_id, testo, categoria: categoria || null, stato: 'da_provare',
  });
  return check(res);
}

export async function markRealizzato(client, id, dataISO) {
  const res = await client.from('desideri').update({ stato: 'realizzato', data_realizzato: dataISO }).eq('id', id);
  return check(res);
}

export async function deleteDesiderio(client, id) {
  const res = await client.from('desideri').delete().eq('id', id);
  return check(res);
}
