-- seed-posta.sql — eventi di prova per mockups/valida-posta.html (passo 4, spec 2026-06-05)
-- Eseguire nel SQL Editor Supabase DOPO aver sostituito le DUE email (non si committano).
-- Autore eventi: account "seconda2" (lei). Destinatario buono/giri: account primario.
-- La polaroid NON si semina qui: si carica dall'app (passa dallo Storage).
-- ⚠️ Non idempotente: ogni esecuzione crea 5 righe nuove (duplicati se rilanciato).

-- 🔥 fantasia (desideri, stato da_provare)
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
)
insert into desideri (couple_id, autore_id, testo, stato)
select couple_id, id, 'una notte in una spa, solo noi due', 'da_provare' from lei;

-- 📅 esperienza
-- Nota: colonna 'data' è di tipo date (non timestamptz), si usa current_date.
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
)
insert into esperienze (couple_id, autore_id, titolo, data, voto)
select couple_id, id, 'Cena al tramonto sul lago', current_date, 0 from lei;

-- 🗺️ luogo (con descrizione → riga in Caveat sulla card)
-- Nota: colonna 'data_evento date NOT NULL' richiesta dallo schema luoghi.sql, si usa current_date.
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
)
insert into luoghi (couple_id, autore_id, nome, lat, lng, intimo, voto, descrizione, data_evento)
select couple_id, id, 'Terrazza sul Garda', 45.605, 10.640, false, 0, 'qui ci siamo promessi di tornare', current_date from lei;

-- 🎟️ buono regalo attivo che scade tra 2 giorni (pill + meta)
with lei as (
  select p.id, p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
), io as (
  select p.id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_PRIMARIO_QUI'
)
insert into buoni (couple_id, da_id, a_id, emoji, titolo, tipo, stato, scadenza_iso)
select lei.couple_id, lei.id, io.id, '🎟️', 'Una colazione a letto', 'regalo', 'attivo',
       now() + interval '2 days'
from lei, io;

-- 🎲 due giri per l'account primario (card "la brace di stasera")
-- Motivo 'gioco': accredita giri guadagnati (non spesi). La pipeline calore filtra
-- solo motivo='giro' (spin effettuato), quindi questi giri non alterano il calore
-- ma compaiono nel saldo disponibile, esattamente come premi reali da giochi.
with lei as (
  select p.couple_id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_SECONDA2_QUI'
), io as (
  select p.id from profiles p join auth.users u on u.id = p.id
  where u.email = 'EMAIL_PRIMARIO_QUI'
)
insert into giri_movimenti (couple_id, user_id, delta, motivo)
select lei.couple_id, io.id, 2, 'gioco' from lei, io;
