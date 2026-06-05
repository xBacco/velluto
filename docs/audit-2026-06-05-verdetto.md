# Audit multi-agente brace — Verdetto finale (2026-06-05)

> Generato dal workflow `brace-audit-verdict`: 16 agenti di audit + 1 sintesi + 3 revisori avversari + 1 verdetto finale (21 agenti, ~1.5M token).
> Findings completi per dimensione: [`audit-2026-06-05-findings.json`](audit-2026-06-05-findings.json)

## Verdetto: TIENI E RIFATTORIZZA — confidenza alta, salute complessiva 6/10

Tutti e 3 i revisori avversari hanno confermato il verdetto (`ilVerdettoRegge: true`), ma hanno imposto **3 correzioni sostanziali**, ognuna verificata a mano:

1. **La rete di sicurezza non copre il cantiere.** 0/22 file di test importano un `js/modules/*.js` (importano solo logic.js 20×, store.js 14×, presence, auth). Le ~6.519 LOC di UI/wiring dove vive lo stallo hanno copertura ZERO. I 255 test proteggono la matematica (poker/calore/economie), non il lavoro home/grafica: ogni replace CSS è una potenziale regressione visiva silenziosa.
2. **Lo sforzo dei token è L, non M.** 384 hex in styles.css (non 148), 115 usi di Arial, 59 di Georgia, 186 dichiarazioni font-family. Non esiste un design system da rifattorizzare: esiste la sua assenza. Niente search-and-replace a parità pixel: tokens.css nuovo + blocchi nuovi puliti sui token (mentalità greenfield).
3. **Il mockup "approvato" incarna l'estetica da abolire.** `mockups/home-C-fusione.html` usa un TERZO set di token (`--ember #ff6f3c`, `--bg #120610`, `--gold #ffb454`) ancorato a JetBrains Mono (27 usi) + Caveat. La direzione visiva va DECISA E CONGELATA in 1 sessione PRIMA di portare il mockup.

**Ridimensionato il "thrashing"**: git mostra che 3 delle 4 spec home sono dello stesso giorno (2026-06-03) e formano un arco di convergenza (esplora→archivia→fonde). La quarta (01-06) è stata implementata in giornata. Lo stallo non è incapacità: la home approvata è semplicemente implementata allo 0% (`feedEventi`/`contaNuovi`/`home_visto_at` = 0 occorrenze in js/).

## Punteggi per dimensione (16 agenti)

| Dimensione | Salute | Blocker | Major | Minor |
|---|---|---|---|---|
| Cervello logico (logic.js) | 8/10 | 0 | 0 | 3 |
| Supabase: schema & sicurezza/RLS | 8/10 | 0 | 1 | 3 |
| Architettura & wiring | 7/10 | 0 | 2 | 2 |
| Ruota a premi | 7/10 | 0 | 2 | 4 |
| Foto/Galleria, Buoni, Desideri, Dadi, Dati | 7/10 | 0 | 2 | 3 |
| Impostazioni | 7/10 | 0 | 2 | 4 |
| Qualità & copertura test | 7/10 | 0 | 2 | 3 |
| Branch onboarding-multicoppia | 7/10 | 0 | 3 | 2 |
| Strip poker | 6/10 | 0 | 1 | 3 |
| Yahtzutra | 6/10 | 0 | 2 | 2 |
| Hub giochi | 6/10 | 0 | 3 | 2 |
| Calendario & Mappa luoghi | 6/10 | 0 | 3 | 2 |
| UX / Architettura delle Informazioni | 5/10 | **2** | 3 | 1 |
| La Home (analisi dedicata) | 5/10 | **1** | 3 | 2 |
| PWA / performance / build | 5/10 | 0 | 3 | 3 |
| Design visivo & salute CSS | 4/10 | **2** | 2 | 2 |

Lettura: il backend/logica/sicurezza è la parte sana (8/10); il dolore è concentrato su **design visivo (4), UX/IA (5), home (5), PWA/perf (5)** — esattamente dove pesa il verdetto.

## Rebuild vs Refactor

**REFACTOR**, con scope onesto:

- **Tenere senza discussione**: logic.js/store.js/schema (1.251 LOC pure, testate) + 602 SQL. RLS `is_member` uniforme, pairing con advisory-lock + consumo atomico + CSPRNG. Un rebuild qui distruggerebbe valore.
- **Tenere anche i moduli di sezione**: contengono logica di prodotto funzionante (ruota 774 LOC, strip 1037, yahtzutra 921). Riscriverli ricompra gli stessi bug senza rete.
- **Mentalità greenfield SOLO per il guscio visivo**: nuovo tokens.css + blocchi nuovi scritti puliti, NON retrofit dei 384 hex a parità pixel.
- **Criterio di reversibilità**: se dopo token unificati + La Posta l'app non è ancora riconoscibile come "tua", e se completare un modulo-gioco costa più della sua riscrittura → si valuta il rebuild greenfield del singolo modulo. Non prima, e mai dell'app intera.

## Punti di forza

1. **logic.js** — ~90 funzioni pure senza I/O, casualità/tempo iniettabili, 255 test verdi (381ms).
2. **Sicurezza multi-coppia** — RLS `is_member(couple_id)` su USING+WITH CHECK, storage isolato per couple_id, pairing anti-race/anti-TOCTOU. Il pezzo migliore del progetto.
3. **Il backbone della home-feed esiste già**: `riepilogoSezioni` (logic.js:828) è il gemello testato di `feedEventi` — la roadmap è nella tua zona di capacità dimostrata.
4. **Spec "La Posta" azionabile** (verificata file per file dal revisore scettico): firme concrete, 6 sorgenti del feed, migrazione, data-flow in 8 step, mockup che gira.
5. **Wiring disaccoppiato**: store con DI del client, moduli a firma uniforme `render*({client,me,panel})`, navigazione via CustomEvent.
6. **Capacità di esecuzione provata**: il 01-06 hai portato un'intera home da mockup a codice in un giorno (~6 commit).

## Rischi principali

### Blocker
1. **Tre palette in conflitto** — styles.css (`#e0683a`), mockup approvato (`#ff6f3c` + JetBrains Mono), proposta sintesi (`#ff6a39`). Step token e step port si combattono finché non congeli UNA direzione visiva in CLAUDE.md.
2. **`home_visto_at` dipende da onboarding.sql** — onboarding.sql:221-222 fa `revoke update on profiles` + `grant update (display_name, avatar, last_seen)`: whitelist per-colonna. La spec La Posta scrive `home_visto_at` su profiles da client → con la whitelist attuale l'UPDATE fallirebbe in silenzio. Onboarding va mergiato PRIMA della home, e il grant esteso.
3. **Home approvata, implementata allo 0%** — la home live è ancora terminale (showCamera/paintHero/selectSlot/buildNotifLog). Giudichi ogni giorno un artefatto che hai già deciso di superare.

### Major
4. **Quiet-state trattato da edge case** — è la home dell'80% delle aperture (di solito il partner non ha lasciato nulla di nuovo). Va progettato da protagonista; i 6 template di card vanno scritti con dati reali PRIMA di costruire.
5. **Lo stridore non sparisce risolvendo i token solo dentro la home** — la home nuova stonerebbe entrando nelle sezioni ancora velluto-serif-Arial. Serve tokens.css globale ereditato, e le disambiguazioni IA di sezione (fiamme-vs-cuori, "Dati"×2, calore×3) salgono di priorità: "non mi piace la home" può essere malessere spostato dalle sezioni.

## Roadmap (10 passi, in ordine)

| # | Azione | Perché | Sforzo |
|---|---|---|---|
| 1 | **Decisione visiva congelata** (1 sessione): UN ember tra #e0683a/#ff6f3c/#ff6a39, 2 famiglie di font, destino esplicito di JetBrains Mono e Caveat, tono (de-terminalizzare il copy). Scritta in CLAUDE.md. Timebox 30 min di mockup di confronto ammesso, poi stop. | Senza, token e port si combattono (3 palette in conflitto, verificato) | S |
| 2 | **Mergiare + applicare onboarding.sql** su Supabase + smoke a due account (smoke.md:121-128). Ricordare il grant `home_visto_at` quando si toccherà profiles. | La home dipende dai grant per-colonna di onboarding (blocker verificato) | M |
| 3 | **feedEventi + contaNuovi in logic.js CON test** (filtro autore≠me, flag nuovo vs vistoAt, card giri, ordinamento) + migrazione home_visto_at + store get/set. | Il lavoro sicuro, testabile, gratificante — gemello di riepilogoSezioni già scritto da te. Primo win verde. DoD = commit + suite verde | M |
| 4 | **6 template di card con dati reali** + quiet-state progettato da protagonista. Validare su device con dati veri. | Il "mi piace" dipende dal copy quanto dal layout; il quiet è l'80% delle aperture | M |
| 5 | **tokens.css globale + ereditarietà** (home.css eredita, non ridefinisce), mentalità greenfield: blocchi nuovi puliti sui token, NIENTE search-and-replace dei 384 hex. | Sforzo reale L ad alto rischio su CSS senza test: va dopo un win verde, spezzato | L |
| 6 | **Port HTML/CSS de La Posta** come sostituzione del #camera, solo DOPO la validazione su device (step 4). Rimuovere showCamera/paintHero/selectSlot/resetHub/buildNotifLog/apriTraguardi. | Da 3 stati a 2; non bruciare la home vecchia prima di aver provato la nuova | L |
| 7 | **Cablare dati e nav**: feed/quiet/dock da feedEventi+riepilogoSezioni, dock a 5, porta overlay 1×/giorno, setHomeVistoAt all'uscita. Calore → una sola superficie. | Completa la home; verifica che il grant home_visto_at funzioni davvero | M |
| 8 | **Disambiguare l'IA di sezione**: renderDati→renderSvuotaDati, fiamme O cuori, Calendario=diario non agenda, decidere link luogo→esperienza, de-promuovere galleria/traguardi dal dock. | Le incoerenze vivono DENTRO le sezioni dove passi il tempo reale | S |
| 9 | **Potare/completare le feature mezze-cablate**, dal bug RLS (policy couples_upd + grant per il flag ×2). Poi jolly/dadi/wild ruota, suoni/vibra strip, promptbar, scadenza buoni. | Insieme creano la sensazione di "incompiuto"; il flag ×2 è un malfunzionamento reale | M |
| 10 | **Quick win perf**: SW cache-first per lo shell, dynamic import() dei moduli-gioco e mappa, Leaflet on-demand + defer Supabase. Igiene hex/font incrementale durante questi tocchi. | L'app parte lenta per scelte di delivery, non bug | M |

## Prossimo singolo passo

Chiudere in **una sessione** le 4 decisioni visive (ember, font, destino mono/Caveat, tono) e scriverle in CLAUDE.md come fonte di verità unica — con le varianti fianco a fianco nel browser. È scegliere tra cose che esistono già, non una quinta esplorazione. Subito dopo: il win verde di `feedEventi` + test.

**Regola di sessione**: definition-of-done = "commit + suite verde", non "mi piace come sembra"; niente nuovi mockup home finché feedEventi non è verde su device.
