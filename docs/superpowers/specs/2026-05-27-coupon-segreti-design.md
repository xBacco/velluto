# Coupon segreti — design

**Data:** 2026-05-27 (aggiornato 2026-05-27 col pivot "economia a giri")
**Stato:** approvato (brainstorming chiuso), pronto per il piano di implementazione.
**Si lega a:** `2026-05-27-economia-giri-ruota-premi-design.md` — **l'apertura di un
segreto non è più libera**: avviene **solo** vincendo la fetta **💋 apri un segreto**
alla Ruota a premi.

## Cos'è

Un quarto tipo di buono: il **segreto**. Chi scrive lascia al partner un messaggio
nascosto dentro una **busta sigillata** (sigillo a bacio 💋). Il partner non lo apre
quando vuole: deve **conquistarsi l'apertura** vincendo il premio **💋 apri un segreto**
alla **Ruota** (vedi spec economia). Vinto il premio, sceglie **quale** busta aprire e la
**rivela** con un'animazione (lettera che rimbalza + pioggia di 💋/❤️/✨). Una volta
aperto, il testo resta visibile nello **Storico**.

> **Cambio rispetto alla prima stesura:** prima il destinatario apriva la busta toccandola
> nella sotto-tab. Ora la sotto-tab **non apre più**: mostra le buste in attesa come
> *teaser*, e l'apertura è il flusso lanciato dal premio della Ruota. Tutto il resto
> (busta, sigillo, animazione, modello dati, civetta, notifiche) resta invariato.

Non è una funzione di sicurezza: il segreto è una **sorpresa a fiducia**, non un
testo cifrato. Con la RLS `is_member` entrambi i membri leggono comunque tutta la
riga sul DB. Il "nascosto" è solo UI.

## Decisioni di design (chiuse in brainstorming)

- **Collocazione:** quarto tipo accanto a Regalo / Richiesta / Bundle. Vive dentro
  la tab **Buoni** come **sotto-tab** `💋 Segreti`, non come tab principale nuova.
- **Fronte busta (titolo-civetta) → Variante C "Civetta":** sulla busta sigillata
  si mostra una **riga-esca** scelta da chi scrive, *diversa* dal contenuto reale
  (es. «Spegni il telefono alle 21…»). Provoca senza svelare. Il titolo vero e il
  corpo restano dentro la lettera, visibili solo dopo l'apertura. La civetta è
  **facoltativa**: se vuota, la busta mostra il fallback generico "Un segreto da X".
- **Ri-rivelare:** nessuna ri-animazione. Nello Storico il testo è già in chiaro.
- **Notifica:** **pallino sulla sotto-tab `💋 Segreti`** (vedi modello sotto).
- **Sigillo:** bacio 💋 in cera, due metà che si spezzano e cadono. (Versione già
  approvata nei mockup; scartate: scioglimento/melt, filtri goo SVG.)
- **Animazione apertura:** "A2 pop con bacetti" — lettera con piccolo rimbalzo +
  burst di 💋/❤️/✨; lettera centrata (titolo + corpo + firma).
- **Modale aperta = sfondo fermo** (regola globale scroll-lock).

## Ciclo di vita

```
creato (sigillato) ──[il destinatario vince 💋 alla Ruota e sceglie questa busta]──> rivelato ──> Storico
     stato=attivo                                                                      stato=riscattato
                                                                                       riscattato_il=now
```

- Solo il **destinatario** (`a_id`) può aprire/rivelare. Il mittente non apre il
  proprio segreto: lo vede "in attesa" finché il partner non lo apre.
- **L'apertura si guadagna alla Ruota:** non è più un tap libero. Il destinatario apre
  una busta **solo** quando vince la fetta 💋 e, nel flusso del premio, sceglie **quale**
  busta tra quelle in attesa. La transizione `'rivela'` parte da lì.
- L'apertura è **irreversibile**: una volta rivelato resta nello Storico.

## Modello dati

Riusa la tabella `buoni` (niente tabella nuova). Mapping delle colonne per un segreto:

| colonna | uso per il segreto |
|---|---|
| `tipo` | nuovo valore `'segreto'` |
| `titolo` (NOT NULL) | titolo **vero** della lettera (nascosto fino all'apertura) |
| `descrizione` (nullable) | **corpo** della lettera (il testo nascosto) |
| `civetta` (NUOVA, nullable) | riga-esca mostrata sulla busta sigillata |
| `rivelato_visto` (NUOVA, bool default false) | il mittente ha visto che il partner ha aperto |
| `stato` | `'attivo'` = sigillato · `'riscattato'` = rivelato |
| `riscattato_il` | timestamp di apertura/rivelazione |
| `emoji` | default `💋` |
| `da_id` / `a_id` | mittente / destinatario (come i regali) |

Il segreto **non** usa `in_attesa`/`rifiutato` né `bundle_id`.

### Migrazione SQL — `supabase/segreti.sql` (nuovo file)

```sql
-- Coupon segreti: estende la tabella buoni.
alter table buoni drop constraint if exists buoni_tipo_check;
alter table buoni add constraint buoni_tipo_check
  check (tipo in ('regalo','richiesta','segreto'));

alter table buoni add column if not exists civetta text;
alter table buoni add column if not exists rivelato_visto boolean not null default false;
```

E si aggiorna `supabase/schema.sql` (per installazioni nuove): il check di `tipo`
include `'segreto'` e si aggiungono le due colonne. La RLS resta invariata: la
policy `buoni_all` (`is_member`) copre già i segreti.

## Componenti e flusso

### 1. `js/lib/logic.js` (funzioni pure, testabili)

- **`applicaTransizioneBuono(buono, 'rivela', nowISO)`** — nuova transizione:
  richiede `tipo === 'segreto'` e `stato === 'attivo'`, altrimenti lancia.
  Ritorna `{ stato: 'riscattato', riscattato_il: nowISO() }`.
- **Filtri segreti:**
  - `segretiDaRivelare(buoni, me)` → `tipo==='segreto' && a_id===me && stato==='attivo'`
  - `segretiInviatiSigillati(buoni, me)` → `tipo==='segreto' && da_id===me && stato==='attivo'`
  - `segretiStorico(buoni, me)` → `tipo==='segreto' && stato==='riscattato'` (entrambe le direzioni)
- **`contaNotificheSegreti(buoni, me)`** → numero per il pallino sulla sotto-tab:
  somma di
  - segreti ricevuti ancora sigillati (`a_id===me && stato==='attivo'`) — "hai lettere da aprire", e
  - segreti inviati appena aperti dal partner (`da_id===me && stato==='riscattato' && rivelato_visto===false`) — "il partner ha aperto il tuo segreto".

### 2. `js/store.js`

- **`addBuono`**: aggiungere `civetta` ai campi accettati e all'insert
  (`civetta: civetta || null`).
- **`marcaSegretiVisti(client, ids)`** (nuova): setta `rivelato_visto = true` sui
  segreti passati (usata quando il mittente apre la sotto-tab e azzera la sua parte
  di pallino). Implementata con un singolo `update ... in (ids)`.
- `listBuoni` non cambia (già `select('*')`: `civetta` e `rivelato_visto` arrivano
  da sé).

### 3. `js/modules/buoni.js`

- **Sotto-tab:** aggiungere `['segreti', '💋 Segreti']` alla riga dei filtri.
  Sul bottone, se `contaNotificheSegreti(rows, me) > 0`, mostrare il pallino
  (riusa il pattern del badge già presente su "Richieste").
- **`drawSegreti(p, me)`** con tre sezioni:
  1. **"In attesa di aprirsi · N"** — `segretiDaRivelare`: card-busta sigillate **NON
     cliccabili per aprire** (teaser). Mostrano la civetta + "da {partner}" + un invito
     tipo "Aprine una vincendo 💋 alla Ruota". L'apertura **non** parte da qui: parte dal
     flusso del premio Ruota (vedi sotto e spec economia §8).
  2. **"Inviati · in attesa"** — `segretiInviatiSigillati`: card-busta in sola
     lettura (civetta + "in attesa che lo apra"), con azione **Elimina**.
  3. **"Storico · rivelati"** — `segretiStorico`: testo in chiaro (titolo + corpo),
     meta "da X · rivelato il …" oppure "inviato da te · aperto il …".
- **Apertura sotto-tab:** quando si entra in `segreti`, chiamare
  `marcaSegretiVisti` sui propri inviati rivelati non ancora visti, poi ridisegnare
  (azzera il pallino lato mittente).
- **Card-busta sigillata:** sigillo-mini 💋 + riga **civetta** in corsivo (o
  fallback "Un segreto da {partner}") + "da {partner} · {quando}" + chevron.
- **Modale-busta + animazione (lanciata dalla Ruota):** è una funzione esportata —
  es. `apriBustaSegreto(client, me, segreto)` — chiamata dal **flusso del premio
  Ruota** dopo che l'utente ha scelto quale busta aprire. Porta il markup/HTML dei
  mockup (`coupon-segreti-app.html` / `coupon-segreti-fronte.html`): busta, flap, cera
  in due metà, lettera (titolo + corpo + firma "— con voglia, {mittente}"), burst di
  emoji, glow. La lettera mostra `titolo` + `descrizione` (corpo). Alla fine esegue la
  transizione `'rivela'` (→ Storico). **Non** esiste più un trigger di apertura dalla
  sotto-tab: l'unico ingresso è la Ruota.
- **Creazione (`openCrea`):** aggiungere il tab `💋 Segreto`. Quando selezionato:
  - campi: **Emoji** (default 💋), **Civetta** (facoltativa, placeholder
    «Spegni il telefono alle 21…»), **Titolo della lettera** (obbligatorio),
    **Il segreto** (textarea = corpo nascosto);
  - nascondere l'editor foto (i segreti sono solo testo);
  - al salvataggio: `addBuono({ tipo:'segreto', da_id:me, a_id:partner,
    stato:'attivo', titolo, descrizione: corpo, civetta })`; dopo il salvataggio
    portare la vista su `segreti`.

### 4. `js/app.js`

Nessuna modifica: i segreti restano dentro `renderBuoni`; il FAB già instrada
`fab:buoni` → `openCrea`.

### 5. `css/style.css`

Portare dai mockup gli stili: `.sealed-card`/card-busta, `.seal-mini`,
`.stage/.env-body/.flap/.wax/.letter/.burst/.glow/.hint` (animazione), e il pallino
sulla sotto-tab. Riusare i token esistenti (`--wine`, `--gold`, `--paper`, ecc.).

## Gestione errori

- Caricamento `listBuoni` già protetto da try/catch + toast in `renderBuoni`.
- Transizione `'rivela'`: in caso di errore di rete il segreto resta sigillato
  (toast "Errore"); l'utente può ritentare. La transizione passa per
  `updateStatoBuono` (stesso percorso di `riscatta`).
- `marcaSegretiVisti`: se fallisce, nessun blocco UI (il pallino si riproverà al
  prossimo render) — fallimento silenzioso accettabile perché è solo cosmetico.
- Titolo della lettera obbligatorio (come gli altri buoni); civetta e corpo
  facoltativi.

## Testing (TDD — `test/buoni.test.js`)

Funzioni pure di `logic.js`, nello stile dei test esistenti:

- `applicaTransizioneBuono('rivela')`: `segreto/attivo` → `riscattato` con
  `riscattato_il`; lancia se non-segreto o non-attivo.
- `segretiDaRivelare` / `segretiInviatiSigillati` / `segretiStorico`: filtrano per
  tipo, direzione e stato corretti.
- `contaNotificheSegreti`: conta ricevuti-sigillati + inviati-rivelati-non-visti;
  zero quando non c'è nulla; non conta i segreti già visti.

## Fuori scope (YAGNI)

- Niente cifratura del testo.
- Niente ri-apertura animata dallo Storico.
- Niente foto nei segreti.
- Niente segreti dentro i Bundle.
- Niente notifiche push/email — solo il pallino in-app.
