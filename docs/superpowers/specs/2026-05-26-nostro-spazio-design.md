# Il nostro spazio — Design / Spec

**Data:** 2026-05-26
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** sito web privato di coppia, a tema erotico/intimo

---

## 1. Scopo

Sito web privato per due partner, dove scrivere e condividere desideri/fantasie,
tenere un diario delle esperienze e giocare a Truth or Dare. Estetica sensuale
ed elegante ("Velluto notturno"). Online, gratis, ma con contenuti **protetti da
password e cifrati**.

Progetto didattico: "io scrivo, lui segue" (vedi pattern del progetto palestra
`xBacco/gym-schedule`). Stack volutamente semplice, niente build step.

## 2. Funzionalità (3 moduli)

### 2.1 🔥 Desideri & fantasie
Bacheca di voci che i due vogliono provare.
- Campi per voce: `testo`, `autore` (lui/lei), `categoria` (opzionale, libera),
  `stato` (da provare / realizzato), `dataRealizzato` (quando segnato fatto).
- Azioni: aggiungi, modifica, elimina, segna come realizzato (con data).
- Filtri: tutti / da provare / realizzati; filtro per autore.
- Ordinamento: più recenti in cima.

### 2.2 📖 Diario condiviso
Note e ricordi delle esperienze.
- Campi per voce: `titolo`, `testo` (racconto/note), `data`, `autore`,
  `voto` (0–5 fiamme, opzionale).
- Azioni: aggiungi, modifica, elimina.
- Ordinamento: dal più recente.

### 2.3 🎲 Truth or Dare
Mazzo di carte a tema coppia.
- **Parte vuoto**: nessuna carta predefinita. I due aggiungono le proprie.
- Campi per carta: `tipo` (verità / sfida), `testo`, `intensità` (1–3, opzionale).
- Azione principale: **pesca a caso** una carta (filtrabile per tipo/intensità).
- Gestione mazzo: aggiungi, modifica, elimina carte.

## 3. Estetica — "Velluto notturno"

- **Palette:** bordeaux profondo `#5c1026`, fondo notte `#2a0813`/`#160409`,
  oro caldo `#d4a86c`, crema `#f3d9b0`.
- **Tipografia:** titoli serif elegante (Georgia / serif di sistema), testo
  in sans-serif di sistema per leggibilità.
- **Mood:** lume di candela, transizioni morbide, raffinato e adulto (non volgare).
- **Responsive:** funziona bene da telefono (uso principale probabile) e da PC.
- Coerente con la regola UI: design distintivo, niente look "AI generico" né
  editoriale-default.

## 4. Privacy & sicurezza

Il repo GitHub deve essere **pubblico** per usare GitHub Pages gratis, quindi:

- **Cifratura dei dati:** tutto il contenuto utente (desideri, diario, carte) è
  cifrato lato client prima di essere salvato in `data.json`. Si usa **Web Crypto
  API** (`AES-GCM`) con chiave derivata dalla password tramite **PBKDF2**
  (salt + IV casuali salvati accanto al ciphertext). Nel repo pubblico finisce
  solo testo cifrato illeggibile.
- **Gate password:** all'apertura il sito chiede la password. Senza la password
  corretta non si decifra nulla e non si vede alcun contenuto.
- **Anti-indicizzazione:** `<meta name="robots" content="noindex,nofollow">` +
  file `robots.txt` con `Disallow: /`.
- **Token GitHub:** il token fine-grained (Contents read/write) vive **solo nel
  `localStorage`** di ogni dispositivo, mai nel repo. Va inserito una volta per
  dispositivo via schermata impostazioni (⚙).
- **Nome discreto:** consigliato un nome repo/progetto neutro e non riconoscibile
  (da concordare prima del deploy), per non attirare attenzione dal profilo GitHub.

> Nota onesta sui limiti: la sicurezza dipende dalla forza della password e dal
> fatto che chi conosce il link **non** conosce la password. La cifratura rende i
> dati illeggibili nel repo pubblico; la password è l'unica chiave. Niente
> password scontate.

## 5. Architettura (Approccio: come gym-schedule)

Sito statico, HTML/CSS/JS vanilla, **niente build step**. Moduli JS separati:

- `crypto.js` — derivazione chiave (PBKDF2) e cifra/decifra (AES-GCM). Funzioni pure
  testabili.
- `store.js` — carica/salva `data.json` via GitHub Contents API; gestione token;
  modalità offline (fallback localStorage se niente token/connessione). La `fetch`
  va wrappata `(...args) => fetch(...args)` per evitare il bug "Illegal invocation"
  già incontrato nel progetto palestra.
- `auth.js` — gate password: deriva la chiave, prova a decifrare; gestisce sessione.
- `app.js` — UI e routing tra le 3 sezioni; orchestrazione.
- `index.html` + `styles.css` — markup e stile "Velluto notturno".

### Modello dati (decifrato, in memoria)
```json
{
  "version": 1,
  "desideri":  [{ "id", "testo", "autore", "categoria", "stato", "creato", "dataRealizzato" }],
  "diario":    [{ "id", "titolo", "testo", "autore", "voto", "data" }],
  "carte":     [{ "id", "tipo", "testo", "intensita" }]
}
```
In `data.json` (nel repo) questo oggetto è salvato **cifrato**:
```json
{ "v": 1, "salt": "...", "iv": "...", "ciphertext": "..." }
```

### Flusso dati
1. Apertura → `auth.js` chiede password → `crypto.js` deriva chiave.
2. `store.js` scarica `data.json` (via API o raw) → `crypto.js` decifra → stato app.
3. Modifiche in `app.js` aggiornano lo stato in memoria.
4. Salvataggio (batch, non a ogni tasto) → `crypto.js` cifra → `store.js` fa
   `PUT` su Contents API (commit su `main`).

### Gestione errori
- Password errata → decifratura fallisce → messaggio "password errata", nessun dato.
- Niente token / errore rete → modalità sola lettura o offline con avviso chiaro
  (no fallimenti silenziosi — lezione dal progetto palestra).
- Conflitti di scrittura (entrambi salvano insieme) → al `PUT` si rilegge lo `sha`
  corrente; in caso di conflitto si ricarica e si riprova, avvisando l'utente.

## 6. Testing

- **Unit test Node** (`node --test`) per le funzioni pure:
  - `crypto.js`: cifra→decifra round-trip; password sbagliata fallisce; salt/IV
    diversi a ogni cifratura.
  - `store.js`: serializzazione, merge, gestione `sha`, con `fetch` iniettata finta.
- **Smoke test in browser vero** (Playwright + server locale, no cache CDN)
  **obbligatorio** prima di dichiarare fatto: login con password, aggiunta voce in
  ogni sezione, salvataggio, reload e ri-decifratura. (Lezione palestra: lo smoke
  test saltato nascose un bug.)

## 7. Deploy

- Repo GitHub **pubblico** (nome discreto da concordare), GitHub Pages su `main`.
- Token fine-grained con permesso **Contents: read/write** sul repo, inserito via ⚙
  su ogni dispositivo.
- Verifica finale: pagina live HTTP 200, `data.json` servito, ciclo cifra/decifra
  funzionante da due dispositivi.

## 8. Fuori scope (YAGNI per ora)

- Account/login multi-utente reali (bastano i due, stessa password).
- Notifiche push, upload immagini/foto, chat in tempo reale.
- App nativa / PWA installabile (eventuale fase successiva).
- Mazzi di carte predefiniti (scelto: partono vuoti).
