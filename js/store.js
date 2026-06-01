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

export async function addBuono(client, { couple_id, da_id, a_id, emoji, titolo, descrizione, tipo, stato, bundle_id, scadenza_iso }) {
  const payload = {
    couple_id, da_id, a_id,
    emoji: emoji || '🎟️', titolo, descrizione: descrizione || null,
    tipo, stato, bundle_id: bundle_id || null,
  };
  if (scadenza_iso != null) payload.scadenza_iso = scadenza_iso;
  const { data, error } = await client.from('buoni').insert(payload).select().single();
  return check({ data, error });
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

// --- Slot (ledger simmetrico a giri_movimenti) ---

export async function listSlotMov(client, coupleId) {
  const { data, error } = await client.from('slot_movimenti').select().eq('couple_id', coupleId).order('creato', { ascending: false });
  return check({ data, error });
}

export async function accreditaSlot(client, { couple_id, user_id, motivo, delta }) {
  const { data, error } = await client.from('slot_movimenti').insert({ couple_id, user_id, motivo, delta }).select().single();
  return check({ data, error });
}

export async function spendiSlot(client, { couple_id, user_id }) {
  const { data, error } = await client.from('slot_movimenti').insert({ couple_id, user_id, motivo: 'tiro', delta: -1 }).select().single();
  return check({ data, error });
}

// --- Flag persistente "prossimo premio ×2" (couples.ruota_flag_doppio) ---

export async function getFlagDoppio(client, coupleId) {
  const { data, error } = await client.from('couples').select('ruota_flag_doppio').eq('id', coupleId).single();
  if (error) check({ data, error });
  return !!data?.ruota_flag_doppio;
}

export async function setFlagDoppio(client, coupleId, value) {
  const { data, error } = await client.from('couples').update({ ruota_flag_doppio: !!value }).eq('id', coupleId);
  return check({ data, error });
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

// ---- STRIP POKER ----
export async function listStripPartite(client, coupleId) {
  const res = await client.from('strip_partite').select('*').eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addStripPartita(client, { couple_id, vincitore_id, perdente_id, modalita }) {
  const res = await client.from('strip_partite').insert({ couple_id, vincitore_id, perdente_id, modalita });
  return check(res);
}

export async function deleteStripPartiteForCouple(client, coupleId) {
  return check(await client.from('strip_partite').delete().eq('couple_id', coupleId));
}

export async function getPartner(client, coupleId, meId) {
  const res = await client.from('profiles').select('*').eq('couple_id', coupleId);
  const rows = check(res) || [];
  return rows.find(r => r.id !== meId) || null;
}

// ---- PROFILO ----
export async function updateProfile(client, id, { display_name, avatar } = {}) {
  const patch = {};
  if (display_name !== undefined) patch.display_name = display_name;
  if (avatar !== undefined) patch.avatar = avatar;
  const res = await client.from('profiles').update(patch).eq('id', id);
  return check(res);
}

// Battito di presenza: aggiorna last_seen del profilo (vedi js/lib/presence.js).
export async function updateLastSeen(client, id, nowISO) {
  const res = await client.from('profiles').update({ last_seen: nowISO }).eq('id', id);
  return check(res);
}

// ---- LUOGHI (Mappa) ----
export async function listLuoghi(client, coupleId) {
  const res = await client.from('luoghi').select('*')
    .eq('couple_id', coupleId).order('creato', { ascending: false });
  return check(res);
}

export async function addLuogo(client, { couple_id, autore_id, nome, citta, lat, lng, intimo, voto, descrizione, data_evento, esperienza_id }) {
  const res = await client.from('luoghi').insert({
    couple_id, autore_id, nome,
    citta: citta || null, lat, lng,
    intimo: !!intimo, voto: voto ?? 0,
    descrizione: descrizione || null, data_evento,
    esperienza_id: esperienza_id || null,
  }).select().single();
  return check(res);
}

export async function updateLuogo(client, id, { nome, citta, intimo, voto, descrizione, data_evento }) {
  const res = await client.from('luoghi').update({
    nome, citta: citta || null, intimo: !!intimo, voto: voto ?? 0,
    descrizione: descrizione || null, data_evento,
  }).eq('id', id);
  return check(res);
}

export async function deleteLuogo(client, id) {
  const res = await client.from('luoghi').delete().eq('id', id);
  return check(res);
}

// ---- SVUOTA DATI (per couple) ----
export async function wipeDesideri(client, coupleId) {
  return check(await client.from('desideri').delete().eq('couple_id', coupleId));
}
export async function wipeEsperienze(client, coupleId) {
  const list = await listEsperienze(client, coupleId);
  for (const e of list) await deleteFotoDi(client, { contesto: 'esperienza', refId: e.id });
  return check(await client.from('esperienze').delete().eq('couple_id', coupleId));
}
export async function wipeBuoni(client, coupleId) {
  const list = await listBuoni(client, coupleId);
  for (const b of list) await deleteFotoDi(client, { contesto: 'buono', refId: b.id });
  return check(await client.from('buoni').delete().eq('couple_id', coupleId));
}
export async function wipeGiochi(client, coupleId) {
  await client.from('giri_movimenti').delete().eq('couple_id', coupleId);
  return check(await client.from('strip_partite').delete().eq('couple_id', coupleId));
}
export async function wipeLuoghi(client, coupleId) {
  const list = await listLuoghi(client, coupleId);
  for (const l of list) await deleteFotoDi(client, { contesto: 'luogo', refId: l.id });
  return check(await client.from('luoghi').delete().eq('couple_id', coupleId));
}
export async function wipeTipi(client, coupleId) {
  return check(await client.from('tipi').delete().eq('couple_id', coupleId));
}
