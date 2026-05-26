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
