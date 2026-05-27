// Tutte le funzioni ricevono `client` (Supabase) come primo argomento → testabili.
// Nessun fallimento silenzioso: in caso di error si lancia un'eccezione.

import { ECONOMIA } from './lib/logic.js';

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

// ---- TIPI di momento (editabili per coppia) ----
export async function listTipi(client, coupleId) {
  const res = await client.from('tipi').select('*').eq('couple_id', coupleId).order('ordine', { ascending: true });
  return check(res);
}

// Inserisce le righe default (vedi logic.tipiDefaultRows) la prima volta per la coppia.
export async function seedTipi(client, rows) {
  const res = await client.from('tipi').insert(rows);
  return check(res);
}

export async function addTipo(client, { couple_id, emoji, label, ordine }) {
  const res = await client.from('tipi').insert({
    couple_id, emoji, label, ordine: ordine ?? 0,
  }).select().single();
  return check(res);
}

export async function updateTipo(client, id, { emoji, label }) {
  const res = await client.from('tipi').update({ emoji, label }).eq('id', id);
  return check(res);
}

export async function deleteTipo(client, id) {
  const res = await client.from('tipi').delete().eq('id', id);
  return check(res);
}

// ---- ESPERIENZE ----
export async function listEsperienze(client, coupleId) {
  const res = await client.from('esperienze').select('*').eq('couple_id', coupleId).order('data', { ascending: false });
  return check(res);
}

// Evento ricco: tipo + titolo (voto/testo/foto opzionali).
export async function addEsperienza(client, { couple_id, autore_id, tipo_id, titolo, testo, data, voto }) {
  const res = await client.from('esperienze').insert({
    couple_id, autore_id, tipo_id: tipo_id || null,
    titolo: titolo || null, testo: testo || null, data, voto: voto ?? 0,
  }).select().single();
  return check(res);
}

export async function updateEsperienza(client, id, { tipo_id, titolo, testo, data, voto }) {
  const res = await client.from('esperienze')
    .update({ tipo_id: tipo_id || null, titolo: titolo || null, testo: testo || null, data, voto: voto ?? 0 })
    .eq('id', id);
  return check(res);
}

// Momento rapido (tally "Segna al volo"): solo tipo + data, niente titolo/voto/foto.
export async function addMomento(client, { couple_id, autore_id, tipo_id, data }) {
  const res = await client.from('esperienze').insert({
    couple_id, autore_id, tipo_id, titolo: null, testo: null, data, voto: 0,
  }).select().single();
  return check(res);
}

export async function deleteEsperienza(client, id) {
  const res = await client.from('esperienze').delete().eq('id', id);
  return check(res);
}

// ---- FOTO (Storage privato bucket 'foto' + tabella 'foto' generica) ----
// path = '<couple_id>/<contesto>/<ref_id>/<file>' (vedi lib/logic.fotoPath)
export async function uploadFoto(client, { coupleId, autoreId, contesto, refId, file, path, didascalia }) {
  const up = await client.storage.from('foto').upload(path, file);
  if (up.error) throw new Error('Upload foto: ' + up.error.message);
  const res = await client.from('foto').insert({
    couple_id: coupleId, autore_id: autoreId, contesto, ref_id: refId,
    storage_path: path, didascalia: didascalia || null,
  }).select().single();
  return check(res);
}

export async function listFoto(client, { contesto, refId }) {
  const res = await client.from('foto').select('*')
    .eq('contesto', contesto).eq('ref_id', refId).order('creato', { ascending: true });
  return check(res);
}

export async function listFotoGalleria(client, coupleId) {
  const res = await client.from('foto').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
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
  const res = await client.from('foto').delete().eq('id', id);
  return check(res);
}

// Cancella tutte le foto di un genitore (usata quando si elimina un buono/esperienza).
// Ritorna il numero di foto NON rimosse dallo storage (per avvisare l'utente).
export async function deleteFotoDi(client, { contesto, refId }) {
  const foto = await listFoto(client, { contesto, refId });
  let fallite = 0;
  for (const f of foto) {
    try { await deleteFoto(client, { id: f.id, storagePath: f.storage_path }); } catch { fallite++; }
  }
  return fallite;
}

// ---- DADI (facce editabili per coppia) ----
export async function listDadiFacce(client, coupleId) {
  const res = await client.from('dadi_facce').select('*')
    .eq('couple_id', coupleId).order('dado', { ascending: true }).order('ordine', { ascending: true });
  return check(res);
}

// Inserisce le righe default (vedi logic.facceDefaultRows) la prima volta per la coppia.
export async function seedDadiFacce(client, rows) {
  const res = await client.from('dadi_facce').insert(rows);
  return check(res);
}

export async function updateDadiFaccia(client, id, { emoji, testo }) {
  const res = await client.from('dadi_facce').update({ emoji, testo }).eq('id', id);
  return check(res);
}

// ---- BUONI ----
export async function listBuoni(client, coupleId) {
  const res = await client.from('buoni').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addBuono(client, { couple_id, da_id, a_id, emoji, titolo, descrizione, tipo, stato, bundle_id }) {
  const res = await client.from('buoni').insert({
    couple_id, da_id, a_id,
    emoji: emoji || '🎟️', titolo, descrizione: descrizione || null,
    tipo, stato, bundle_id: bundle_id || null,
  }).select().single();
  return check(res);
}

export async function updateStatoBuono(client, id, patch) {
  const res = await client.from('buoni').update(patch).eq('id', id);
  return check(res);
}

export async function deleteBuono(client, id) {
  const res = await client.from('buoni').delete().eq('id', id);
  return check(res);
}

// ---- CARTE (Obbligo o Verità) ----
// Il modulo ToD non è ancora costruito; la ruota legge il mazzo per la fetta 🃏.
export async function listCarte(client, coupleId) {
  const res = await client.from('carte').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

// ---- ECONOMIA A GIRI (ledger insert-only) ----
export async function listGiri(client, coupleId) {
  const res = await client.from('giri_movimenti').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

// Accredito: delta +1 di default (motivo 'settimanale'/'gioco'/'ancora').
export async function accreditaGiro(client, { couple_id, user_id, motivo, delta = 1 }) {
  const res = await client.from('giri_movimenti').insert({ couple_id, user_id, delta, motivo, esito: null });
  return check(res);
}

// Spesa di un giro: delta -1, motivo 'giro', esito = chiave della fetta vinta.
export async function spendiGiro(client, { couple_id, user_id, esito }) {
  const res = await client.from('giri_movimenti').insert({ couple_id, user_id, delta: -1, motivo: 'giro', esito });
  return check(res);
}

// Hook per i giochi: accredita i giri di una vittoria.
export async function concediGiro(client, { couple_id, user_id }) {
  return accreditaGiro(client, { couple_id, user_id, motivo: 'gioco', delta: ECONOMIA.GIRI_PER_VITTORIA });
}

// ---- CONTENUTI RUOTA (editabili per coppia) ----
export async function listRuotaContenuti(client, coupleId) {
  const res = await client.from('ruota_contenuti').select('*')
    .eq('couple_id', coupleId).order('categoria', { ascending: true }).order('ordine', { ascending: true });
  return check(res);
}

// Semina i default (vedi logic.ruotaContenutiDefaultRows) la prima volta per la coppia.
export async function seedRuotaContenuti(client, rows) {
  const res = await client.from('ruota_contenuti').insert(rows);
  return check(res);
}

export async function addRuotaContenuto(client, { couple_id, categoria, emoji, testo, descrizione, ordine }) {
  const res = await client.from('ruota_contenuti').insert({
    couple_id, categoria, emoji: emoji || null, testo, descrizione: descrizione || null, ordine: ordine ?? 0,
  }).select().single();
  return check(res);
}

export async function updateRuotaContenuto(client, id, { emoji, testo, descrizione }) {
  const res = await client.from('ruota_contenuti')
    .update({ emoji: emoji || null, testo, descrizione: descrizione || null }).eq('id', id);
  return check(res);
}

export async function deleteRuotaContenuto(client, id) {
  const res = await client.from('ruota_contenuti').delete().eq('id', id);
  return check(res);
}
