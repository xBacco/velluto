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

# Smoke test Fase 3 — esito (COMPLETO post-migrazione, salvo flusso cross-account)

Data: 2026-05-26
Browser: Chromium via Playwright, viewport 390x844 (mobile)
Server: `python -m http.server 5500` (avviato dal worktree fase3)
Branch: `worktree-fase3-buoni-foto`
Migrazione: `supabase/foto.sql` eseguita dall'utente; tabella `foto` + RLS attive. Storage path = `<couple_id>/<contesto>/<ref_id>/<file>`.

## Boot / wiring / render (OK)
- [x] App carica senza errori di import dei moduli ES (unico errore console: `favicon.ico` 404).
- [x] Login ok + chip profilo (🦊 Tomas); nav 4 tab: Desideri · Esperienze · Buoni · Galleria.
- [x] Buoni: 3 viste (Ricevuti/Inviati/Richieste) + empty state.
- [x] Switch tipo a "Bundle": righe extra + "＋ aggiungi buono", editor foto si nasconde (fix TDZ ok a runtime).

## Flussi dati (OK, account Tomas)
- [x] Regalo + foto: creato, appare in Inviati; foto via signed URL Supabase (naturalWidth 200).
- [x] Foto allegata: thumb sfocata → tap rivela → tap apre viewer; Galleria mostra cella "buono" + "↩ Vai ai Buoni" naviga all'origine.
- [x] Bundle (2 sotto-buoni): creato, "Apri bundle" mostra le 2 voci; "Riscatta" su una → transizione di stato persistita.
- [x] Richiesta: creata, compare in Richieste come "in attesa".
- [x] Esperienze (regressione refactor): nuova esperienza + foto OK, signed URL carica (200), giorno evidenziato.
- [x] Privacy: signed URL con token → 200; stesso path senza token → 400 (bucket privato).
- [x] Eliminazione esperienza (confermata entro i 2s del two-tap): rimuove riga esperienza + riga `foto` + oggetto storage (verificato via query/list: tutto a 0). Stesso esito per eliminazione buono.
- [x] Suite unit completa: `node --test` → 46 pass / 0 fail.
- [x] Dati di test creati durante lo smoke ripuliti: esperienze 0, buoni 0, foto 0, storage 0.

## Note / osservazioni minori (non bloccanti)
- Il two-tap "Elimina" ha un timeout di re-arm di 2s (`calendario.js`): in test automatizzati con latenza tra i due click il secondo click ri-arma invece di confermare (non è un bug del prodotto, ma è la causa di un falso allarme "foto orfana" durante lo smoke — risolto: era un artefatto di test + una list su prefisso storage errato).
- Badge bundle passa a "riscattato" già al primo dei due sotto-buoni riscattati (UX minore; logica coperta dagli unit test).

## DA COMPLETARE — richiede il secondo account (Giulia)
- [ ] Cross-account: Giulia accetta/rifiuta una richiesta inviata da Tomas; il destinatario riscatta un regalo ricevuto. (Transizioni di stato già coperte da `buoni.test.js`; manca solo la verifica browser a due account.)
- [ ] Solo a smoke cross-account verde: `drop table if exists esperienza_foto;`

# Smoke test Ruota a premi (4a)

## Ruota a premi (4a)
- [ ] Tab Giochi → selettore mostra 🎲 Dadi e 🎡 Ruota; i Dadi funzionano come prima.
- [ ] Ruota: la card saldo mostra i pallini-gettone e "gratis tra N giorni" (o "gratis disponibile").
- [ ] Alla prima apertura della coppia i contenuti si seminano (proposte/buoni presenti nell'editor).
- [ ] GIRA LA RUOTA: la ruota gira (~4s), le emoji restano DRITTE durante e dopo il giro.
- [ ] A fine giro: spotlight sullo spicchio in alto + pop-up "proiezione di luce" centrato.
- [ ] Saldo: girare scala di 1 il saldo; a saldo 0 il bottone è disabilitato.
- [ ] Premio differito: vincere 🎁 crea un buono nella tab Buoni; vincere 🔥 mostra una proposta.
- [ ] Fette condizionali: 💋 spenta senza segreti in attesa; 🃏 spenta a mazzo vuoto; 🔥/🎁 spente se svuoti la categoria nell'editor.
- [ ] Editor (＋ con Ruota selezionata): aggiungi/modifica/elimina una proposta e un buono → si riflette al giro successivo.
- [ ] "Ultimi premi" elenca le vincite recenti.
- [ ] Reload pagina: saldo e contenuti persistono.
- [ ] Con pop-up aperto, lo sfondo NON scrolla (scroll-lock).

## Mappa (tab 🗺️) — Fase Mappa Luoghi
- [ ] Migrazione `supabase/luoghi.sql` applicata (tabella `luoghi` + `foto_contesto_check` con 'luogo').
- [ ] Aggiunta luogo via ricerca indirizzo (Nominatim) e via tap sulla mappa.
- [ ] Pin → polaroid con flash, flip fronte/retro; francobollo + cuori solo sui luoghi intimi.
- [ ] Modifica luogo (descrizione, voto, foto) e eliminazione.
- [ ] Drawer statistiche: switch 📍/🔥, barre per mese, tap mese → posti del mese.
- [ ] Scroll-lock attivo con overlay aperti.

## App pronta (Lussuria) — 2026-05-27
- [ ] PWA: "Aggiungi a Home" su iOS dà icona fiamma + apertura fullscreen; Android offre install.
- [ ] Nessun overscroll: la pagina non rimbalza quando il contenuto ci sta; scrolla solo l'area centrale.
- [ ] Swipe: il contenuto segue il dito, scatta alla sezione adiacente, rimbalzo ai bordi (no wrap).
- [ ] Swipe verticale = scroll; tally/chips orizzontali scrollano per conto loro.
- [ ] Mappa-isola: dentro la cartina si pana/zooma; si esce dalla dock.
- [ ] Impostazioni dal chip profilo (schermo intero).
- [ ] Profilo: cambio nome/icona si salva e il chip si aggiorna.
- [ ] Blocco PIN: set → reload → gate → sblocco; cambio codice; disattivazione.
- [ ] Biometrico (iPhone): toggle visibile, attiva, sblocca al riavvio (PIN in fallback).
- [ ] Modalità pudica: foto sfocate di default, tap rivela; galleria coperta come `.thumb` (fix Task 11).
- [ ] Tag: add/del si riflette nel calendario.
- [ ] Contenuti giochi (da Impostazioni → Personalizza): apre tab Giochi sulla Ruota e mostra l'editor proposte/buoni.
- [ ] Svuota dati: checklist → conferma → la sezione scelta risulta vuota (Tag torna ai default).
- [ ] Cambia password: aggiornata, login con la nuova.

## Onboarding multi-coppia (smoke a due account) — 2026-06-03
> Prerequisito: aver applicato `supabase/onboarding.sql` nel SQL Editor di Supabase.
> ✔ Applicata e verificata il 2026-06-05: policy ok (codici_sel, profiles_sel/upd, niente
> profiles_ins), grant UPDATE solo su display_name/avatar/last_seen, niente INSERT, 4 RPC presenti.
- [x] Account A: "Registrati" (email+password) → mail di conferma → conferma → accedi.
- [x] Account A: link "Registrati"/"Password dimenticata?" visibili sotto il form di login.
- [x] Account A: dopo l'accesso senza profilo parte l'onboarding (non il vecchio reload).
- [x] Account A: "Create la vostra coppia" → nome+avatar → appare il codice di 6 caratteri.
- [x] Account A: nella Home il banner "$ coppia --attesa" mostra il codice + "↻ rigenera".
- [x] Account A: "↻ rigenera" → il codice cambia, il vecchio non funziona più.
- [x] Account B (altro device/browser): Registrati → conferma → accedi → "Ho un codice" → codice + nome+avatar → entra.
- [x] Account B vede lo storico di A; al refresh la presenza mostra entrambi; il banner attesa sparisce per entrambi.
- [x] Account C con un codice già usato/scaduto → errore chiaro, nessuno stato sporco.
- [x] Account A prova a unirsi al proprio codice → rifiutato lato server (il guard "Sei già in una coppia" interviene prima del check dedicato; protezione equivalente).
- [x] Doppio tap rapido su "Registrati"/"Password dimenticata?" non invia due richieste (bottone disabilitato).

> ✔ Smoke completato il 2026-06-05 in locale (http-server :8080, branch onboarding-multicoppia,
> 3 account reali). Bug trovato e fixato durante lo smoke: search_path della RPC senza schema
> `extensions` → `gen_random_bytes does not exist` su Supabase (fix in onboarding.sql, ri-applicato).

## Home "La Posta" — migrazione home_visto_at — 2026-06-05

> ✔ `supabase/home.sql` applicata nel SQL Editor il 2026-06-05 (colonna `profiles.home_visto_at`
> + grant per-colonna). Colonna verificata via REST con anon key (select → 200, prima 42703).
> Il grant UPDATE si smoke-testa su device al passo 7 (cablaggio: setHomeVistoAt all'uscita dalla home).

## La Posta — card + quiet (validazione su device) — 2026-06-10

> ✔ Validato su iPhone reale via Cloudflare quick tunnel (server `python -m http.server 5500`),
> loggato come account primario. Dati seminati con `supabase/seed-posta.sql` (forma robusta).
> Gate roadmap "feedEventi verde su device" → CHIUSO.

- [x] Feed pieno: le 4 card seminate compaiono tutte, ordine corretto, accenti giusti:
  - [x] fantasia "serata coniglietta" — kicker `UNA FANTASIA NUOVA`, 🔥, accento ember, testo in Caveat (voce di lei)
  - [x] esperienza "verona" — kicker `UNA NUOVA ESPERIENZA`, icona calendario
  - [x] luogo "verona" + "una notte di fuoco" (Caveat) — kicker `HA SEGNATO UN POSTO`, accento ember
  - [x] buono "una leccata" — kicker `UN BUONO PER TE`, icona ticket, accento oro
  - [x] card giri "Hai 2 giri da spendere" — kicker `LA BRACE DI STASERA` + pill `gira la ruota →`
- [x] Buono SENZA pill scadenza: atteso. Il seed base non imposta `scadenza_iso`, quindi
  `giorni=null` → nessuna pill. NON è un bug: il ramo è corretto e coperto da `feed.test.js`
  ("buono con scadenza vicina → pill; senza → niente pill"). La pill richiede `scadenza_iso`,
  colonna aggiunta dalla migration `supabase/slot.sql`; per vederla sul device usare la variante
  commentata nel seed (e avere slot.sql applicata).
- [x] Stato quieto (toggle `◐ pieno / quieto`): il feed collassa nello stato calmo
  ("Tutto tranquillo, per ora.", Fraunces) con i gradi del calore ("La brace tiene 91°", ember);
  restano solo gli item persistenti azionabili (buoni + ruota). Comportamento corretto.

### DA COMPLETARE — richiede upload reale come Giulia
- [ ] Card polaroid 🖼️: non seminabile via SQL (richiede una foto caricata dall'app, passa dallo Storage).

## Home — La Posta cablata nella home REALE — 2026-06-11

> Branch: `feat/home-posta-cablaggio` (off master). Suite: `node --test` → **301 pass / 0 fail**.
> Il 2026-06-10 il feed era validato solo nella preview `mockups/valida-posta.html`; la home
> viva (`#home`) renderizzava ancora il log terminale. Qui il feed entra nella home reale:
> `home.js` `buildPosta()` (feedEventi → cardHTML/quietHTML, parità con valida-posta.html) al
> posto di `buildNotifLog`; `<div id="posta">` in `index.html`; de-terminalizzato il chrome
> (`$ notifiche --tail`, `$ coppia --attesa`, `❯ entra`, `+fantasia` mono → Nunito); SW v28→v29.
> Verifica headless (Playwright, non loggato): 0 errori console, `#posta` montato, `notifLog`/
> `notifBadge` rimossi, bottone "entra nella stanza" in Nunito.
>
> ⚠️ STATO: DA ESEGUIRE SU DEVICE (login Supabase richiesto per popolare il feed reale).

- [ ] Aprendo la home (loggato) compare il **feed di card umanizzate**, NON più il log
      terminale `$ notifiche --tail 3` / `~/fantasie`.
- [ ] Stato pieno: le card di lei con kicker giusti (`UNA FANTASIA NUOVA`, ecc.), accenti
      (ember/oro/rosa), voce di lei in Caveat, pallino ● sulle nuove.
- [ ] Tap su una card → apre la sua sezione (fantasie/esperienze/mappa/buoni/galleria).
- [ ] Card "giri" presente se hai giri da spendere (kicker `LA BRACE DI STASERA`).
- [ ] Stato quieto (nessuna novità da lei): blocco "Tutto tranquillo, per ora." (Fraunces) +
      gradi del calore in ember; restano solo buoni + ruota.
- [ ] Chrome de-terminalizzato: niente `$ … --flag`, niente `❯`/`~/`; bottone "entra nella
      stanza" e promptbar in Nunito (non più JetBrains Mono).
- [ ] La porta "entra nella stanza" funziona ancora (apre l'hub); nessun errore in console.
