-- seed-posta.sql — eventi di prova per la home "La Posta" (validazione card + quiet, spec 2026-06-05)
--
-- Esecuzione: SQL Editor di Supabase. Sostituisci le DUE email placeholder con quelle reali
-- PRIMA di eseguire (le email vere NON si committano). Run-once.
--
-- Forma a prova di copia (lezione 2026-06-10): un solo statement per riga, stringhe in
-- dollar-quote ($$...$$), niente emoji nello SQL, solo colonne reali dello schema. La copia
-- dalla chat corrompe virgolette tipografiche e a-capo: questa forma le evita. Niente WITH /
-- cross-join: l'email vive inline nel WHERE di ogni statement.
--
-- Autore eventi: account "seconda2" (lei). Destinatario buono/giri: account primario (io).
-- La polaroid NON si semina qui: richiede un upload reale dall'app (passa dallo Storage).
--
-- /!\ NON idempotente: ogni esecuzione crea righe nuove (rilanci = duplicati).

-- fantasia (desideri, stato da_provare) -> card "una fantasia nuova", testo in Caveat (voce di lei)
insert into desideri (couple_id, autore_id, testo, stato) select p.couple_id, p.id, $$serata coniglietta$$, $$da_provare$$ from profiles p join auth.users u on u.id = p.id where u.email = $$EMAIL_SECONDA2_QUI$$;

-- esperienza -> card "una nuova esperienza". Colonna `data` e' di tipo date: current_date.
insert into esperienze (couple_id, autore_id, titolo, data, voto) select p.couple_id, p.id, $$verona$$, current_date, 0 from profiles p join auth.users u on u.id = p.id where u.email = $$EMAIL_SECONDA2_QUI$$;

-- luogo -> card "ha segnato un posto". `descrizione` -> riga in Caveat. `data_evento` NOT NULL: current_date.
insert into luoghi (couple_id, autore_id, nome, lat, lng, intimo, voto, descrizione, data_evento) select p.couple_id, p.id, $$verona$$, 45.605, 10.640, false, 0, $$una notte di fuoco$$, current_date from profiles p join auth.users u on u.id = p.id where u.email = $$EMAIL_SECONDA2_QUI$$;

-- buono regalo attivo (da lei -> a me) -> card "un buono per te" (icona ticket, accento oro).
-- PILL SCADENZA: la pill "scade in N giorni" compare SOLO se imposti scadenza_iso. Quella
-- colonna esiste sul tuo DB solo dopo la migration supabase/slot.sql (Fase 4b). Lo statement
-- attivo qui sotto NON la imposta (sempre eseguibile, niente pill: comportamento di default).
-- Per validare ANCHE la pill: applica slot.sql e usa la variante commentata al posto di questa riga.
insert into buoni (couple_id, da_id, a_id, titolo, tipo, stato) select p.couple_id, (select id from auth.users where email = $$EMAIL_SECONDA2_QUI$$), p.id, $$una leccata$$, $$regalo$$, $$attivo$$ from profiles p join auth.users u on u.id = p.id where u.email = $$EMAIL_PRIMARIO_QUI$$;
-- Variante con pill (richiede slot.sql applicata) — usala AL POSTO della riga sopra, non in aggiunta:
-- insert into buoni (couple_id, da_id, a_id, titolo, tipo, stato, scadenza_iso) select p.couple_id, (select id from auth.users where email = $$EMAIL_SECONDA2_QUI$$), p.id, $$una leccata$$, $$regalo$$, $$attivo$$, now() + interval '2 days' from profiles p join auth.users u on u.id = p.id where u.email = $$EMAIL_PRIMARIO_QUI$$;

-- due giri per l'account primario -> card "la brace di stasera" + pill "gira la ruota".
-- motivo 'gioco' accredita giri guadagnati (la pipeline calore filtra solo motivo='giro', cioe' lo
-- spin effettuato): non altera il calore, ma entra nel saldo disponibile come un premio reale.
insert into giri_movimenti (couple_id, user_id, delta, motivo) select p.couple_id, p.id, 2, $$gioco$$ from profiles p join auth.users u on u.id = p.id where u.email = $$EMAIL_PRIMARIO_QUI$$;
