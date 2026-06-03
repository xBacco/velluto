# Home "la posta di lei" — design

**Data:** 2026-06-03
**Branch:** `feat/home-definitiva`
**Stato:** design approvato, pronto per il piano di implementazione
**Supera:** `2026-06-01-home-definitiva-port-design.md` (home a porta→camera→hub). La
cerimonia varco/camera viene ritirata in favore di una home piatta con dock diretto.

## Obiettivo

La home deve contenere **notifiche di eventi reali** (nuove fantasie del partner, buoni
ricevuti, foto, luoghi, esperienze, giri/tiri disponibili) — **non** uno storico delle
fantasie — e deve **sempre sembrare viva**: un mix di stato-coppia (calore + presenza) e
invito ad agire, anche quando non c'è nulla di nuovo. Scopo prodotto: tenere l'attenzione
attiva e alimentare la voglia di usare l'app **insieme al partner**.

Forma scelta: **D2 "biglietti"** valorizzato (mockup `mockups/home-D2plus-biglietti.html`).
Gli eventi sono oggetti che il partner ti ha lasciato (lettera con sigillo, ticket, polaroid),
non righe di una lista.

## Decisioni bloccate

1. **Protagonista = la posta di lei.** Il comodino di biglietti domina lo schermo.
   Calore = pill in topbar; scorte = striscia compatta sopra il feed. Di conseguenza lo
   **stato quieto** (zero novità) è progettato con cura per non sembrare vuoto.
2. **"Nuovo / non letto" = sincronizzato via DB.** Nuova colonna `profiles.home_visto_at`
   (timestamptz, nullable). Il "nuovo" è coerente su tutti i dispositivi.
3. **Navigazione = home piatta + dock diretto.** Toccare una voce del dock entra
   direttamente nella sezione (`dispatch('goto', key)`). Si ritirano gli stati
   `#camera`/hub e l'animazione porta-zoom.

## Tassonomia notifiche

**Tipo A — Eventi (azzerabili, "da ultima apertura")** — righe con `autore ≠ me`:

| Sorgente | Filtro | Emoji | Sezione |
|---|---|---|---|
| `desideri` | `autore_id ≠ me ∧ stato='da_provare'` | 🔥 | desideri |
| `buoni` | `a_id = me ∧ stato='attivo'` | 🎁/🎟️ (da `emoji`) | buoni |
| `foto` (galleria) | `autore_id ≠ me` | 🖼️ | galleria |
| `luoghi` | `autore_id ≠ me` | 🗺️ | mappa |
| `esperienze` | `autore_id ≠ me` (in arrivo o appena create) | 📅 | calendario |

`nuovo = creato > home_visto_at` (se `home_visto_at` è null → tutto nuovo).

**Tipo B — Scorte/contatori persistenti** — non si azzerano:

- 🎡 ruota: saldo giri (`saldoGiri`) + "gratis pronto" via `giriEleggibile` (ricarica 7g).
- 🎰 slot: saldo tiri (`saldoSlot`, cap 10) + "gratis pronti" via `slotEleggibile`
  (`TIRI_SETTIMANALI`=5, `GRATIS_OGNI_GIORNI`=7), incremento effettivo via `accreditoConCap`.

## Architettura

### `js/lib/logic.js` — nuove funzioni pure (con test)

```
feedEventi(liste, me, vistoAt) -> Evento[]
  Evento = { tipo, emoji, sezioneKey, testo, autoreId, quandoISO, nuovo, refId }
  - fonde desideri/buoni/foto/luoghi/esperienze secondo la tabella Tipo A
  - filtra autore ≠ me
  - ordina per quandoISO desc
  - nuovo = quandoISO > vistoAt (vistoAt null ⇒ true)
  - `testo` generato da template per tipo (es. desiderio.testo, buono.titolo, ecc.)

contaNuovi(feed) -> number            // quanti con nuovo===true

statoScorte(giri, slot, meId, now) -> {
  giri: { n, gratisPronti, prossimoISO },
  slot: { n, gratisPronti, prossimoISO }
}
  - n = saldoGiri/saldoSlot
  - gratisPronti = giriEleggibile/slotEleggibile(.ok)
  - prossimoISO = .prossimoSblocco

semiInvito(liste, me) -> string[]     // 2-3 spunti per lo stato quieto
  - euristiche su cosa manca (es. nessuna fantasia recente di me → "lasciale una fantasia")
```

`feedEventi` NON tocca il calore: il calore resta gestito da `calcolaCalore` (invariato).

### `js/store.js` — persistenza "visto"

```
getHomeVistoAt(client, meId) -> string|null   // profiles.home_visto_at
setHomeVistoAt(client, meId, iso) -> void
```

Nessun fallimento silenzioso (pattern `check()` esistente). Se la lettura fallisce, la home
degrada trattando tutto come "non nuovo" (niente falsi pallini).

### Migrazione SQL

```sql
alter table profiles add column if not exists home_visto_at timestamptz;
```

Da aggiungere allo script di migrazione del progetto (stessa sede delle migrazioni
esistenti). Nessun'altra modifica di schema.

### `js/modules/home.js` — riscrittura `renderHome`

Rende il layout piatto D2 a partire dai dati reali già fetchati in parallelo (best-effort,
come oggi). Componenti dall'alto:

1. **Topbar** — brand, pill calore (apre il pop-up calore esistente, invariato), chip coppia
   con presenza (`isOnline(partner.last_seen)`).
2. **Saluto** — "lei ti ha lasciato N cose" (N = `contaNuovi`). Varia per stato (vedi sotto).
3. **Scorte** 🎡🎰 — da `statoScorte`; "gratis pronti" in verde; tap → `goto` ruota/slot.
4. **Comodino biglietti** — `feedEventi`; oggetto per tipo (lettera/ticket/polaroid/…); i
   `nuovo` hanno il sigillo che pulsa, il più fresco è sollevato; tap su un biglietto →
   `goto` sezione + marca letto (ottimistico in UI).
5. **Compose** — "lasciale qualcosa…" → apre il flusso di creazione fantasia (`goto` desideri
   in modalità nuova, o evento dedicato se già esiste).
6. **Dock** — 6 sezioni (`SEZIONI`) + traguardi; tap → `goto` diretto.

**Scrittura `home_visto_at`:** alla **uscita** dalla home (evento `goto`, prima di navigare)
si chiama `setHomeVistoAt(now)`. Così al rientro i pallini "nuovo" riflettono solo ciò che è
arrivato dopo l'ultima visita. Il valore letto a `renderHome` è quello salvato dalla volta
precedente (si cattura in una variabile prima di sovrascriverlo).

### Tre stati (il "sempre viva")

- **Pieno** (`contaNuovi > 0`): saluto "lei ti ha lasciato N cose"; biglietti nuovi col
  sigillo che pulsa, il più fresco sollevato.
- **Quieto** (`contaNuovi === 0`): saluto "la vostra brace è a X°"; in cima una riga calda
  (calore + delta) + **1 invito** (teaser) + **semi di fantasia** (`semiInvito`) come
  affordance per fare la prima mossa; i biglietti già letti restano visibili ma "posati"
  (ingialliti). Mai schermata vuota.
- **Sola** (partner offline): tono "lei è fuori ora", luce più bassa (var `--heat` non
  cambia, cambia solo il copy/presenza), ma calore, scorte e inviti restano attivi.

### Reciprocità + feedback calore

- Compose sempre presente → spinge la risposta.
- Dopo aver lasciato qualcosa, micro-conferma con **anteprima del +peso calore**
  (es. "+5° alla vostra brace") usando `PESI_CALORE`. Il ricalcolo reale avviene al prossimo
  `renderHome`/`aggiornaCalore`.
- Buono riscosso / evento passato escono dal feed (filtri di `feedEventi`).

## File toccati

- `js/lib/logic.js` — `feedEventi`, `contaNuovi`, `statoScorte`, `semiInvito` (+ test).
- `js/store.js` — `getHomeVistoAt`, `setHomeVistoAt`.
- migrazioni SQL — colonna `profiles.home_visto_at`.
- `js/modules/home.js` — riscrittura `renderHome` (layout D2 piatto, 3 stati); rimozione
  della macchina porta/camera/hub (`enterRoom`/`exitRoom`/`showCamera` e relativo wiring).
- `index.html` — sostituzione del markup statico `#home`/`#camera` con il markup piatto D2
  (il markup attuale è statico, letto da `home.js` via id). Da verificare in fase di piano.
- `js/app.js` — gestione `gohub`: tornare alla home piatta invece che all'hub. Da verificare.
- CSS della home (stessa sede degli stili attuali) — stili D2 (palette `:root` invariata,
  font Fraunces+Nunito+JetBrains Mono+Caveat).
- Service worker — bump versione cache + lista asset.

## Fuori scope (YAGNI)

- Le 6 sezioni interne (desideri/giochi/calendario/mappa/buoni/galleria) restano com'è.
- Engine ruota/slot, logica calore (`calcolaCalore`/pesi) — invariati. I pesi calore
  restano i placeholder attuali (`PESI_CALORE`, "DA VERIFICARE sui dati reali"): la loro
  calibrazione non fa parte di questo lavoro.
- Nessun nuovo tipo di evento o di buono ("segreto" resta non implementato).
- Niente notifiche push.

## Verifica

- Mockup di riferimento: `mockups/home-D2plus-biglietti.html` (con console calore + insieme/soli).
- Test unitari per `feedEventi` (filtro autore, ordinamento, flag `nuovo` su `vistoAt`),
  `statoScorte` (saldi + gratis-pronti + cap), `semiInvito`.
- Manuale: stato pieno / quieto / sola; azzeramento pallini al rientro dopo navigazione;
  "gratis pronti" 🎰 in verde quando `slotEleggibile.ok`.
