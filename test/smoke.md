# Smoke test Fase 1 — esito

Data: 2026-05-26
Browser: Chromium via Playwright, viewport 390x844 (mobile)
Server: `python -m http.server 5500`

- [x] gate login + errore credenziali ("Email o password non corretti.")
- [x] login ok + chip profilo (🦊 Tomas)
- [x] aggiunta desiderio (testo + categoria) → compare come "Da provare"
- [x] segna realizzato → pill "Realizzato" + data "Fatto il 26/05/2026"
- [x] filtri (Da provare nasconde il realizzato; Tutti lo mostra)
- [x] elimina (conferma a due tap "Sicuro?") → voce rimossa
- [x] persistenza dopo reload + sessione restano attive
- [x] logout dal chip → torno al gate login

## Note
- Bug di setup trovato e risolto durante il test: lo schema SQL era stato eseguito ma
  mancava il passo P4 (insert in `couples` + `profiles`). Senza profilo, il login
  riusciva ma `currentProfile()` falliva con 406 "Cannot coerce the result to a single
  JSON object". Inserite coppia + profili (Tomas 🦊 / Giulia 🦋) risolvendo gli id auth
  dalle email; RLS verificata: come Tomas i profili della coppia sono leggibili.
- Console: unico errore `favicon.ico` 404 (innocuo).

# Smoke test Fase 2 — esito

Data: 2026-05-26
Browser: Chromium via Playwright, viewport 390x844 (mobile)
Server: `python -m http.server 5500`
Setup Storage: bucket `foto` privato + policy sel/ins/upd/del (verificate via REST: upload 200, signed URL 200, fetch firmato 200, fetch senza auth 400, delete 200)

- [x] calendario mese corrente ("Maggio 2026", Lun→Dom, 1–31) + giorno oggi cliccabile + timeline vuota
- [x] nuova esperienza (titolo/data/voto 4/racconto) + upload foto
- [x] card in timeline con 🔥🔥🔥🔥🤍 + thumbnail caricata via signed URL (naturalWidth 64)
- [x] giorno 26 evidenziato nel calendario + tap giorno → sheet "Esperienze del 26/05/2026"
- [x] modifica: voto a 5 (🔥🔥🔥🔥🔥) + rimozione foto (0 thumbnail)
- [x] elimina esperienza (conferma "Sicuro?" a due tap) → timeline vuota + giorno non più evidenziato
- [x] persistenza dopo reload (voto 5, niente foto, giorno evidenziato)
- [x] foto non accessibili senza login (Storage privato → HTTP 400)

## Note
- Backend Storage validato via REST prima del test browser (le 4 policy funzionano).
- Foto di test caricata e poi rimossa: nessun oggetto orfano nel bucket.
