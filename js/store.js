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

// ---- ESPERIENZE ----
export async function listEsperienze(client, coupleId) {
  const res = await client.from('esperienze').select('*').eq('couple_id', coupleId).order('data', { ascending: false });
  return check(res);
}

export async function addEsperienza(client, { couple_id, autore_id, titolo, testo, data, voto }) {
  const res = await client.from('esperienze').insert({
    couple_id, autore_id, titolo, testo: testo || null, data, voto: voto ?? 0,
  }).select().single();
  return check(res);
}

export async function updateEsperienza(client, id, { titolo, testo, data, voto }) {
  const res = await client.from('esperienze')
    .update({ titolo, testo: testo || null, data, voto: voto ?? 0 }).eq('id', id);
  return check(res);
}

export async function deleteEsperienza(client, id) {
  const res = await client.from('esperienze').delete().eq('id', id);
  return check(res);
}

// ---- FOTO (Storage privato bucket 'foto' + tabella esperienza_foto) ----
export async function uploadFoto(client, { coupleId, esperienzaId, file, path }) {
  const up = await client.storage.from('foto').upload(path, file);
  if (up.error) throw new Error('Upload foto: ' + up.error.message);
  const res = await client.from('esperienza_foto')
    .insert({ esperienza_id: esperienzaId, couple_id: coupleId, storage_path: path })
    .select().single();
  return check(res);
}

export async function listFotoRows(client, esperienzaId) {
  const res = await client.from('esperienza_foto').select('*')
    .eq('esperienza_id', esperienzaId).order('creato', { ascending: true });
  return check(res);
}

export async function signedUrl(client, storagePath, expiresIn = 3600) {
  const { data, error } = await client.storage.from('foto').createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error('Signed URL: ' + error.message);
  return data.signedUrl;
}

export async function deleteFoto(client, { id, storagePath }) {
  const rm = await client.storage.from('foto').remove([storagePath]);
  if (rm.error) throw new Error('Rimozione foto: ' + rm.error.message);
  const res = await client.from('esperienza_foto').delete().eq('id', id);
  return check(res);
}
