# Vita – Guida completa

Questa guida ti porta da zero all'app funzionante sul tuo iPhone. Ti servono solo il PC con Debian 13 e un iPhone: nessun Mac, nessun costo.

**Come usarla**

- Esegui i capitoli **nell'ordine in cui sono scritti**: ognuno usa il risultato del precedente.
- I comandi nei riquadri grigi vanno copiati e incollati nel **Terminale**, uno alla volta, premendo Invio dopo ciascuno.
- Dove trovi `TUO-UTENTE` scrivi il tuo nome utente GitHub. Dove trovi `TUO-SOTTODOMINIO` scrivi quello che sceglierai su Cloudflare.

**Indice**

1. Com'è fatta Vita
2. Privacy: chi può vedere i tuoi dati
3. Preparare il PC (Debian 13)
4. Preparare il progetto e provarlo sul PC
5. Pubblicare l'app su GitHub Pages
6. Creare il server delle notifiche su Cloudflare
7. Installare l'app sull'iPhone
8. Collegare le notifiche nell'app
9. Portare dentro il calendario che usi già
10. Sicurezza e cifratura nel dettaglio
11. Backup, ripristino e cambio telefono
12. Cosa succede se…
13. Aggiornamenti e manutenzione
14. Problemi comuni e soluzioni
15. Checklist mensile
16. Appendice A – Provare l'app sull'iPhone in rete locale
17. Appendice B – Struttura del progetto

---

## 1. Com'è fatta Vita

### È un'app sul tuo iPhone, non un sito

Vita si installa sulla schermata Home e da lì si apre come un'app vera e propria:

- ha la sua icona e si apre a schermo intero, senza barra dell'indirizzo né pulsanti di Safari;
- nel multitasking compare come app separata;
- ha un suo archivio dati, separato da quello di Safari;
- funziona anche senza Internet.

Safari serve **una sola volta**, per installarla. Dopo puoi anche non aprirlo mai più.

### Dove vivono le varie parti

| Parte | Dove si trova | A cosa serve |
|---|---|---|
| **I tuoi dati** | **Solo sul tuo iPhone**, nell'archivio dell'app | Finanze, calendario, diario, note: tutto |
| Il codice dell'app | GitHub Pages (gratis) | Da qui l'iPhone scarica l'app e i suoi aggiornamenti. Contiene solo il programma, nessun dato |
| Il server delle notifiche | Cloudflare Workers (gratis) | Fa suonare i promemoria quando l'app è chiusa. Riceve solo orari e testi già cifrati sul telefono |
| I backup | iCloud Drive, nella tua cartella | File cifrati con la tua password |

### Perché serve il server delle notifiche

iOS non permette a nessuna app web di restare attiva in background. Senza un server i promemoria suonerebbero solo con l'app aperta.

Il server su Cloudflare risolve il problema: ogni minuto controlla se c'è un promemoria da inviare e lo manda tramite il servizio di notifiche di Apple. Fa anche da "ponte" per leggere i calendari di Google o iCloud da un indirizzo web (capitolo 9).

---

## 2. Privacy: chi può vedere i tuoi dati

Vita è costruita perché **nessuno, tranne te, possa leggere i tuoi dati**. Ecco cosa vede ciascuno.

| Chi | Cosa può vedere | Cosa NON può vedere |
|---|---|---|
| **Tu** | Tutto, dopo PIN o Face ID | – |
| **Chi prende in mano il tuo iPhone** | Niente, se l'iPhone ha un codice e Vita ha il suo PIN | Tutto il contenuto dell'app. Le anteprime delle notifiche si nascondono con l'impostazione del capitolo 8 |
| **Apple** | I file di backup su iCloud come blocchi illeggibili; il passaggio delle notifiche, cifrate | Il contenuto dei backup e delle notifiche |
| **GitHub** | Il **codice** dell'app (pubblico, uguale per tutti); gli indirizzi IP che scaricano la pagina, come per qualsiasi sito | Qualsiasi tuo dato: l'app non invia nulla a GitHub |
| **Cloudflare** | Un identificativo casuale del telefono; l'indirizzo tecnico per le notifiche (un server Apple); **gli orari** dei promemoria dei prossimi 14 giorni | Titoli, luoghi, importi, nomi, note: arrivano **già cifrati** dal telefono e solo l'iPhone ha la chiave per leggerli |
| **Google / iCloud / Outlook** | I calendari che già ospitano | Tutto ciò che fai in Vita: l'app non invia loro nulla |
| **Inserzionisti, statistiche, terze parti** | Nulla | Vita non contiene pubblicità, tracciamento né statistiche, e una regola di sicurezza (CSP) impedisce di caricare codice esterno |

### Cosa resta comunque visibile (spiegato con onestà)

- **Gli orari dei promemoria** sul server Cloudflare: il server deve sapere *quando* inviarli, ma non *cosa* dicono.
- **Il tuo indirizzo IP** quando l'iPhone contatta GitHub o Cloudflare: succede con qualsiasi sito o app.
- **Il contenuto di un calendario sincronizzato da indirizzo web** passa attraverso il server nel momento in cui viene scaricato. Non viene salvato e non viene registrato da nessuna parte. Se vuoi evitare anche questo passaggio, importa il calendario da file (capitolo 9, metodo A): in quel caso nessun server è coinvolto.
- **Il codice** dell'app è pubblico, perché GitHub Pages gratuito lo richiede. Il codice è uguale per tutti e non contiene nessun tuo dato, chiave o password.

### Le regole d'oro della privacy

1. **Inserisci dati solo nell'app installata**, mai in una scheda di Safari.
2. **Fai sempre backup cifrati**, con una password robusta che conosci solo tu.
3. **Non caricare mai backup, CSV o file .ics su GitHub.** Il progetto è già configurato per ignorarli: non forzarlo.
4. **Le chiavi segrete di Cloudflare** (`VAPID_PRIVATE_KEY` e `APP_TOKEN`) vanno solo nel tuo gestore di password e nei comandi di Cloudflare, **mai** dentro file del progetto.
5. **Sull'iPhone** usa un codice di almeno 6 cifre e attiva Face ID. Imposta le anteprime delle notifiche su "Se sbloccato".
6. **Su iCloud** attiva la Protezione avanzata dei dati: Impostazioni → [il tuo nome] → iCloud → **Protezione avanzata dei dati**. Così anche il resto del tuo iCloud è cifrato end-to-end.
7. **In Vita** attiva PIN, Face ID e blocco automatico (capitolo 7).

---

## 3. Preparare il PC (Debian 13)

Apri il **Terminale**: cercalo tra le applicazioni oppure premi `Ctrl+Alt+T`.

### 3.1 Installa gli strumenti

```bash
sudo apt update
sudo apt install -y nodejs npm git unzip curl gh keepassxc
```

Il sistema ti chiede la password del tuo utente Linux: scrivila (non vedrai i caratteri) e premi Invio. Ecco cosa installi:

| Strumento | A cosa serve |
|---|---|
| `nodejs` e `npm` | Costruire e provare l'app |
| `git` | Salvare le versioni del codice |
| `gh` | Comunicare con GitHub dal terminale |
| `keepassxc` | Gestore di password, per custodire le chiavi segrete. Se usi già il portachiavi iCloud o un altro gestore, puoi ignorarlo |

### 3.2 Controlla le versioni

```bash
node -v
```

Deve comparire `v20` o un numero più alto (Debian 13 installa la 20.19). Se compare un numero più basso, installa Node 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3.3 Configura git

Usa il nome e l'email del tuo account GitHub.

```bash
git config --global user.name "Il Tuo Nome"
git config --global user.email "tua-email@example.com"
git config --global init.defaultBranch main
```

Se non vuoi che la tua email compaia nella cronologia pubblica del codice, usa l'email anonima di GitHub. La trovi in github.com → Settings → Emails, sotto **Keep my email addresses private**; ha la forma `12345678+TUO-UTENTE@users.noreply.github.com`. Attiva anche quell'opzione.

---

## 4. Preparare il progetto e provarlo sul PC

### 4.1 Estrai il progetto

Metti `vita.zip` nella cartella Download. Poi:

```bash
cd ~
unzip ~/Download/vita.zip -d ~
cd ~/vita
```

Se la tua cartella si chiama `Downloads`, scrivi `~/Downloads/vita.zip`.

### 4.2 Installa le dipendenze ed esegui i test

```bash
npm install
npm test
```

Alla fine deve comparire **`Tests 32 passed`**. I test verificano finanze, ricorrenze, calendari, CSV, cifratura dei backup e cifratura dei promemoria.

### 4.3 Prova l'app sul PC

```bash
npm run dev
```

Apri nel browser del PC l'indirizzo `http://localhost:5173`. Per fermare il server torna nel terminale e premi `Ctrl+C`.

---

## 5. Pubblicare l'app su GitHub Pages

### 5.1 Crea l'account GitHub

Se non ce l'hai, vai su https://github.com/signup e completa la registrazione, gratuita. Per sicurezza attiva l'autenticazione a due fattori: Settings → Password and authentication → **Two-factor authentication**.

### 5.2 Collega il PC a GitHub

```bash
gh auth login
```

Scegli le risposte con le frecce e conferma con Invio:

1. **GitHub.com**
2. **HTTPS**
3. **Y**, per autenticare git con le tue credenziali GitHub
4. **Login with a web browser**

Copia il codice a 8 caratteri che compare, premi Invio, incollalo nella pagina che si apre e autorizza.

### 5.3 Crea il repository, attiva Pages e pubblica

```bash
cd ~/vita
git init
git add -A
git commit -m "Prima versione di Vita"
gh repo create vita --public --source=. --remote=origin
gh api -X POST "repos/$(gh api user -q .login)/vita/pages" -f build_type=workflow
git push -u origin main
```

GitHub Pages gratuito richiede un repository **pubblico**. Diventa pubblico solo il codice del programma: i tuoi dati non passano mai da GitHub (capitolo 2).

### 5.4 Attendi la pubblicazione

```bash
gh run watch
```

Quando compare un segno di spunta verde, l'app è online. Il tuo nome utente lo vedi con:

```bash
gh api user -q .login
```

L'indirizzo dell'app è:

```
https://TUO-UTENTE.github.io/vita/
```

**Annotalo**: serve nel capitolo 6.

Se la pubblicazione fallisce al passo "deploy":

1. Apri il repository su github.com e vai in **Settings → Pages → Build and deployment → Source** e scegli **GitHub Actions**.
2. Poi rilancia la pubblicazione:

```bash
gh workflow run deploy.yml
```

Da ora in poi, ogni `git push` esegue i test, ricostruisce e ripubblica l'app automaticamente.

---

## 6. Creare il server delle notifiche su Cloudflare

Tempo stimato: 15 minuti. Il servizio è gratuito e non richiede carta di credito.

### 6.1 Crea l'account Cloudflare

1. Vai su https://dash.cloudflare.com/sign-up.
2. Inserisci email e password, poi conferma l'email cliccando sul link che ricevi.
3. Il piano gratuito ("Free") è attivo da subito.
4. **Consigliato:** attiva la verifica in due passaggi. Clicca sull'icona del profilo in alto a destra → **Profilo** → **Autenticazione** → **Autenticazione a due fattori**.

### 6.2 Installa gli strumenti del server

```bash
cd ~/vita/worker
npm install
```

### 6.3 Collega il PC al tuo account Cloudflare

```bash
npx wrangler login
```

Si apre il browser: accedi a Cloudflare e clicca **Allow**. Torna al terminale e controlla:

```bash
npx wrangler whoami
```

Deve comparire la tua email.

### 6.4 Crea l'archivio del server

```bash
npx wrangler kv namespace create STORE
```

Il risultato è simile a questo:

```
[[kv_namespaces]]
binding = "STORE"
id = "3f2a9c1e7b4d4e8f9a0b1c2d3e4f5a6b"
```

**Copia il valore di `id`**, la lunga sequenza tra virgolette.

### 6.5 Configura il file `wrangler.toml`

```bash
nano wrangler.toml
```

Modifica tre righe:

| Riga | Cosa scrivere |
|---|---|
| `ALLOWED_ORIGIN = "..."` | `https://TUO-UTENTE.github.io`, **senza** `/vita` e senza `/` finale |
| `VAPID_SUBJECT = "..."` | `https://TUO-UTENTE.github.io/vita/`, cioè l'indirizzo della tua app. Così non serve pubblicare la tua email |
| `id = "..."` | L'id copiato al passo 6.4 |

Esempio, con il nome utente `mariorossi`:

```toml
ALLOWED_ORIGIN = "https://mariorossi.github.io"
VAPID_SUBJECT = "https://mariorossi.github.io/vita/"
...
id = "3f2a9c1e7b4d4e8f9a0b1c2d3e4f5a6b"
```

Salva con `Ctrl+O` e Invio, poi esci con `Ctrl+X`.

Questi tre valori **non sono segreti**: possono stare su GitHub. `ALLOWED_ORIGIN` fa sì che solo la tua app possa usare il server.

### 6.6 Pubblica il server

```bash
npm run deploy
```

La prima volta Cloudflare può chiederti di scegliere un sottodominio `workers.dev`. Sceglie un nome neutro: comparirà nell'indirizzo del server.

Alla fine compare l'indirizzo del server, per esempio:

```
https://vita-push.TUO-SOTTODOMINIO.workers.dev
```

**Annotalo.**

### 6.7 Genera le chiavi segrete

```bash
npm run vapid
```

Compaiono tre valori:

| Nome | A cosa serve |
|---|---|
| `VAPID_PUBLIC_KEY` | Identifica il tuo server presso Apple |
| `VAPID_PRIVATE_KEY` | **Segreta.** Firma le notifiche |
| `APP_TOKEN` | **Segreto.** È la "password" che l'app usa per parlare con il server |

**Salvali subito nel gestore di password**, per esempio KeePassXC sul PC (crea una voce "Vita – Cloudflare") oppure il portachiavi iCloud. `APP_TOKEN` ti servirà anche sull'iPhone: il modo più comodo è salvarlo in Password di iCloud, così lo ritrovi sul telefono.

### 6.8 Carica le chiavi sul server

Esegui un comando alla volta. Ognuno chiede **"Enter a secret value:"**: incolla il valore corrispondente (con `Ctrl+Shift+V` nel terminale) e premi Invio.

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
```

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```

```bash
npx wrangler secret put APP_TOKEN
```

Le chiavi incollate così non finiscono nella cronologia del terminale né in alcun file. Alla fine pulisci lo schermo:

```bash
clear
```

### 6.9 Verifica che funzioni

Sostituisci l'indirizzo con il tuo.

```bash
curl https://vita-push.TUO-SOTTODOMINIO.workers.dev
```

Risposta attesa: `Vita worker attivo`.

```bash
curl https://vita-push.TUO-SOTTODOMINIO.workers.dev/vapid
```

Risposta attesa: `{"error":"non autorizzato"}`. È corretto: senza `APP_TOKEN` il server non risponde.

### 6.10 Salva la configurazione su GitHub

```bash
cd ~/vita
git add worker/wrangler.toml
git commit -m "Configurazione server notifiche"
git push
```

### 6.11 Cosa fa il server e quanto costa

- **Ogni minuto** controlla se c'è un promemoria da inviare e lo manda tramite il servizio di Apple.
- Conserva solo identificativi casuali, orari e testi cifrati che non è in grado di leggere.
- **Non tiene registri** delle richieste: l'opzione `observability` è disattivata.
- **Piano gratuito:** 100.000 richieste e 1.000 scritture al giorno. Vita ne usa circa 1.440 di controllo al giorno e scrive solo quando cambi qualcosa. Costo: **0 €**.

---

## 7. Installare l'app sull'iPhone

> **Prima di iniziare:** installa l'app **prima** di inserire dati. Ciò che scrivi in una scheda di Safari resta in Safari e non compare nell'app installata.

### 7.1 Aggiungi l'app alla schermata Home

1. Apri **Safari** e vai su `https://TUO-UTENTE.github.io/vita/`.
2. Tocca **•••** nella barra dell'indirizzo, poi **Condividi**.
3. Scorri e tocca **Aggiungi alla schermata Home**.
4. Controlla che **"Apri come app web" sia ATTIVO**. Se è spento, l'icona aprirebbe Safari.
5. Tocca **Aggiungi**.
6. Chiudi Safari e apri **Vita dall'icona** sulla Home.

Per verificare che sia installata correttamente: l'app si apre a schermo intero, senza barra dell'indirizzo, e in **Altro → Impostazioni** la riga "App installata sulla Home" mostra ✅.

### 7.2 Proteggi l'app

Vai in **Altro → Impostazioni**:

1. **Archiviazione persistente** → **Richiedi**.
2. **Imposta codice di blocco**: 4–6 cifre, non prevedibili.
3. Attiva **Sblocco con Face ID**.
4. **Blocco automatico**: "Subito" o "Dopo 1 minuto".

### 7.3 Fai subito il primo backup cifrato

Vai in **Impostazioni → Crea backup cifrato** e segui il capitolo 11.

### 7.4 Dati di esempio (facoltativo)

**Impostazioni → Carica dati di esempio** riempie l'app per provarla. Per toglierli: **Rimuovi i dati di esempio**. I tuoi dati non vengono toccati.

---

## 8. Collegare le notifiche nell'app

### 8.1 Concedi il permesso

1. In Vita vai in **Altro → Impostazioni → Notifiche**.
2. Alla riga "Permesso" tocca **Attiva** e poi **Consenti**.
3. Tocca **Invia notifica di prova**: deve comparire subito.

### 8.2 Collega il server Cloudflare

1. Nella sezione **Notifiche in background** compila:
   - **Indirizzo server:** `https://vita-push.TUO-SOTTODOMINIO.workers.dev`
   - **Token:** il valore di `APP_TOKEN`. Toccando il campo, iOS può proporlo dalle Password se lo hai salvato lì.
2. Tocca **Attiva notifiche in background**.
3. Tocca **Invia prova dal server**: entro pochi secondi arriva "🔔 Vita – Le notifiche in background funzionano."

### 8.3 Prova con l'app chiusa

1. Crea un evento tra 5 minuti con **Avviso: All'ora dell'evento**.
2. Chiudi Vita completamente: scorri verso l'alto dal fondo dello schermo e spingi via la scheda di Vita.
3. Aspetta: la notifica arriva all'ora giusta (con un margine di circa un minuto).

### 8.4 Imposta iOS per la privacy e l'affidabilità

**Impostazioni iOS → Notifiche → Vita:**

- **Consenti notifiche:** attivo
- **Schermata di blocco, Centro Notifiche, Banner:** attivi
- **Mostra anteprime: Se sbloccato.** Con l'iPhone bloccato si vede solo "Vita", senza il testo.

Se usi una modalità **Full immersion** (Non disturbare, Sonno, Lavoro), aggiungi Vita alle app consentite: Impostazioni → Full immersion → [modalità] → App → Aggiungi Vita.

### 8.5 Scegli cosa notificare

In **Impostazioni → Notifiche** di Vita trovi:

- interruttori per eventi, routine, abitudini, pagamenti, obiettivi, umore, meditazione, revisione e backup;
- gli **orari silenziosi** (per esempio dalle 22:30 alle 07:00): i promemoria che cadono in quella fascia arrivano alla fine del silenzio;
- l'orario del check-in dell'umore e quello della meditazione.

### 8.6 Come funziona, in breve

1. Ogni volta che modifichi qualcosa, Vita prepara i promemoria dei **prossimi 14 giorni**.
2. **Li cifra sull'iPhone** (AES-256-GCM, con una chiave che non lascia mai il telefono) e li invia al server.
3. Il server, ogni minuto, invia quelli in scadenza ai server di Apple. Il messaggio viaggia con una seconda cifratura, quella standard delle notifiche web.
4. L'iPhone riceve il messaggio, lo decifra con la sua chiave e mostra la notifica.

**Importante:** il server conosce solo le prossime due settimane. **Apri Vita almeno una volta ogni 10–14 giorni** perché i promemoria successivi vengano aggiornati. Basta aprirla, non serve fare altro.

---

## 9. Portare dentro il calendario che usi già

Il calendario di Vita è **interno all'app**:

- gli eventi vengono copiati e salvati sul telefono, e restano visibili anche offline;
- ogni calendario ha **il suo colore** e si mostra o nasconde toccando il pallino in **Calendario → icona a livelli** (in alto a destra);
- puoi dare a un singolo evento un colore diverso da quello del suo calendario.

### Metodo A – Da file .ics (massima privacy: nessun server coinvolto)

**1. Esporta il calendario dal servizio che usi:**

- **Google Calendar** (dal PC): calendar.google.com → ⚙️ **Impostazioni** → **Importa ed esporta** → **Esporta**. Scarichi uno zip con un file .ics per ogni calendario.
- **iCloud** (dal PC): icloud.com/calendar → icona di condivisione accanto al calendario → attiva **Calendario pubblico** → copia il link. Incollalo nel browser sostituendo `webcal://` con `https://` e scarichi il file. Poi **disattiva di nuovo** "Calendario pubblico".
- **Outlook:** Impostazioni → Calendario → Calendari condivisi → Pubblica un calendario → ICS.

**2. Porta il file sull'iPhone** e salvalo nell'app File (via iCloud Drive o email).

**3. In Vita** vai in **Calendario → icona a livelli → Importa file .ics**, scegli il file, poi:

- **Nuovo calendario**: prende nome e colore dal file;
- oppure un calendario esistente.

Se reimporti lo stesso file in futuro, gli eventi vengono **aggiornati** senza creare doppioni.

### Metodo B – Da indirizzo web (si aggiorna da solo; usa il server del capitolo 6)

**1. Trova l'indirizzo del calendario:**

- **Google:** ⚙️ Impostazioni → clicca sul calendario nella colonna a sinistra → **Integra calendario** → **Indirizzo segreto in formato iCal**.
- **iCloud:** il link del Calendario pubblico (vedi sopra; in questo caso va lasciato attivo).
- **Outlook:** il link ICS pubblicato.

**2. Collega il ponte.** In Vita vai in **Impostazioni → Calendari** e tocca **Usa indirizzo e token del server notifiche**.

**3. Aggiungi il calendario.** Vai in **Calendario → icona a livelli → Aggiungi da URL**, incolla l'indirizzo e scegli nome e colore.

Vita aggiorna il calendario all'apertura, se sono passate più di 6 ore; puoi forzarlo con **Sincronizza ora**.

**Privacy:** l'indirizzo segreto viaggia cifrato e non compare in nessun registro. Il contenuto del calendario passa dal tuo server solo nel momento dell'aggiornamento e non viene salvato. Gli eventi sincronizzati sono in sola lettura: si modificano nel calendario di origine.

### Calendari automatici

- **Festività italiane**, Pasqua compresa.
- **Scadenze**: pagamenti ricorrenti, debiti e crediti, scadenze di obiettivi e traguardi.

---

## 10. Sicurezza e cifratura nel dettaglio

| Elemento | Protezione |
|---|---|
| **Backup cifrato** | La chiave si ricava dalla password con **Argon2id** (64 MiB di memoria, 3 passaggi), l'algoritmo che ha vinto la Password Hashing Competition. I dati sono cifrati con **AES-256-GCM**. Sale da 256 bit e vettore iniziale da 96 bit nuovi a ogni backup. Anche l'intestazione è autenticata: se qualcuno altera un solo byte del file, la decifratura fallisce. I dati vengono compressi prima della cifratura. Se WebAssembly non fosse disponibile, l'app ripiega da sola su PBKDF2-SHA256 con 1.000.000 di iterazioni |
| **Password del backup** | Misuratore di robustezza; le password deboli vengono rifiutate; serve la conferma. La password non viene mai salvata da nessuna parte |
| **PIN dell'app** | Mai salvato in chiaro: solo un'impronta Argon2id con sale. Confronto a tempo costante. Dopo errori ripetuti l'app si blocca: 30 secondi dopo 5 errori, 5 minuti dopo 8, 30 minuti da 10 in su. Il conteggio resta anche chiudendo l'app |
| **Face ID / Touch ID** | Usa il sistema di autenticazione di iOS (WebAuthn): il riconoscimento avviene nel chip sicuro dell'iPhone |
| **Blocco automatico** | Da "Subito" a 15 minuti. Quando l'app va in background il contenuto viene sfocato e non si vede nel multitasking |
| **Promemoria sul server** | Cifrati **end-to-end** sul telefono con AES-256-GCM e una chiave che non lascia mai l'iPhone. Identificativi resi anonimi con HMAC-SHA256. Il server vede solo gli orari |
| **Trasporto delle notifiche** | Seconda cifratura standard delle notifiche web (RFC 8291) e firma del server (RFC 8292) |
| **Server Cloudflare** | Risponde solo a chi ha `APP_TOKEN` (confronto a tempo costante) e solo dall'indirizzo della tua app. Nessun registro permanente |
| **Dati sul telefono** | Nell'archivio dell'app, protetti dalla cifratura hardware di iOS quando l'iPhone è bloccato. Per questo il codice dell'iPhone è importante: almeno 6 cifre |
| **Codice dell'app** | Regola di sicurezza (CSP) che impedisce di caricare script esterni. Nessuna libreria di terze parti caricata da Internet |

**Come scegliere la password del backup**

- Usa una frase di 4–5 parole a caso con un numero, per esempio `Mare-Limone-Treno-Viola-27`.
- Salvala nel gestore di password **e** su carta, in un luogo sicuro.
- **Non è recuperabile:** se la dimentichi, nessuno, nemmeno tu, può aprire quel backup.

---

## 11. Backup, ripristino e cambio telefono

### 11.1 Fare un backup (ogni settimana: l'app te lo ricorda)

1. Vai in **Altro → Impostazioni → Crea backup cifrato (consigliato)** e scrivi la password due volte.
2. Nel foglio di condivisione scegli **Salva in File**.
3. Scegli **iCloud Drive**, crea una cartella "Vita backup" e tocca **Salva**.

Il file si chiama, per esempio, `vita-backup-2026-11-18_2130-cifrato.json`. Contiene tutto: finanze con le foto degli scontrini, eventi, routine, obiettivi, note, diario, salute e impostazioni.

### 11.2 Copie automatiche interne

Vita fa una copia interna al giorno e conserva le ultime 10, più una copia prima di ogni ripristino o cancellazione. Servono a **tornare indietro dopo un errore**: si trovano in **Impostazioni → Copie automatiche interne**.

Non sostituiscono il backup su iCloud: se l'app venisse eliminata, sparirebbero insieme a lei.

### 11.3 Ripristinare

1. Vai in **Impostazioni → Ripristina da un backup** e scegli il file da iCloud Drive.
2. Inserisci la password.
3. Vita salva una copia dei dati attuali, ripristina e si riavvia.

### 11.4 Passare a un nuovo iPhone

1. Sul vecchio iPhone fai un **backup cifrato** su iCloud Drive.
2. Sul nuovo iPhone installa Vita dallo **stesso indirizzo** (capitolo 7).
3. Apri Vita, vai in **Impostazioni → Ripristina da un backup** e scegli il file.
4. Reimposta PIN e Face ID.
5. Ricollega le notifiche (capitolo 8). Il nuovo telefono genera **una sua chiave** per i promemoria: la chiave del vecchio non viene mai copiata.
6. Sul vecchio iPhone, se lo cedi o lo vendi: Impostazioni → Generali → Trasferisci o inizializza iPhone → **Inizializza contenuto e impostazioni**.

Il backup di iCloud dell'intero iPhone **non** garantisce di riportare i dati delle app web: affidati al tuo file di backup.

### 11.5 Esportazioni non cifrate (usale con attenzione)

- **Backup non cifrato:** leggibile da chiunque abbia il file. Sconsigliato.
- **CSV dei movimenti** (Finanze → Movimenti → Esporta CSV): si apre in Numbers ed Excel ed è leggibile da chiunque abbia il file. Eliminalo dopo l'uso.

---

## 12. Cosa succede se…

| Situazione | Effetto sui dati di Vita |
|---|---|
| Chiudi l'app, riavvii o aggiorni iOS | Nessuno |
| Non usi Vita per settimane | I dati restano: le app installate sulla Home sono escluse dalla pulizia automatica di Safari. Ma i promemoria in background si fermano dopo 14 giorni senza aperture |
| Usi Vita in una scheda di Safari | È un archivio diverso, che Safari può cancellare dopo 7 giorni di inattività. Usa sempre l'icona |
| **Elimini l'icona di Vita** | **Tutti i dati dell'app vengono cancellati.** Fai prima un backup |
| Impostazioni → App → Safari → **Cancella cronologia e dati** | Può cancellare anche i dati delle app web installate. Fai prima un backup |
| iPhone quasi pieno | iOS può liberare spazio. L'archiviazione persistente riduce il rischio; il backup lo azzera |
| Perdi l'iPhone | Senza il codice dell'iPhone e il PIN di Vita nessuno accede ai dati. Usa **Dov'è** per bloccarlo o inizializzarlo, poi ripristina il backup su un nuovo iPhone |
| Cambi nome utente GitHub | Cambia l'indirizzo dell'app: reinstallala dal nuovo indirizzo, ripristina il backup e aggiorna `ALLOWED_ORIGIN` e `VAPID_SUBJECT` (capitolo 6.5), poi `npm run deploy` |
| Cancelli il repository GitHub | L'app installata continua a funzionare, ma non riceve più aggiornamenti |
| Cancelli il server Cloudflare | Le notifiche ad app chiusa si fermano; tutto il resto funziona |

---

## 13. Aggiornamenti e manutenzione

### 13.1 Pubblicare una modifica all'app

```bash
cd ~/vita
npm test
git add -A
git commit -m "Descrizione della modifica"
git push
```

Dopo circa un minuto, aprendo Vita sull'iPhone compare il banner **"Nuova versione disponibile"**: tocca **Aggiorna**. I dati non vengono toccati.

### 13.2 Numerare una nuova versione

```bash
npm version patch
git push --follow-tags
```

`patch` porta la versione da 1.0.0 a 1.0.1. Usa `minor` per novità più grandi (1.0.0 → 1.1.0).

### 13.3 Aggiornare le dipendenze

```bash
cd ~/vita
npm outdated
npm update
npm audit
npm test && npm run build
git add -A && git commit -m "Aggiornate le dipendenze" && git push
```

| Comando | Cosa fa |
|---|---|
| `npm outdated` | Mostra quali pacchetti hanno versioni più recenti |
| `npm update` | Aggiorna restando su versioni compatibili |
| `npm audit` | Segnala vulnerabilità note |

Per i salti di versione maggiore (per esempio `npm install vite@latest`) aggiorna un pacchetto alla volta e prova l'app prima di pubblicare.

### 13.4 Aggiornare il server Cloudflare

```bash
cd ~/vita/worker
npm update
npm run deploy
```

### 13.5 Cambiare le chiavi del server (consigliato una volta l'anno o se temi che siano state viste)

```bash
cd ~/vita/worker
npm run vapid
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put APP_TOKEN
```

Poi, sull'iPhone:

1. **Impostazioni → Disattiva notifiche in background**.
2. Inserisci il nuovo **Token**.
3. **Attiva notifiche in background**.

### 13.6 Modificare il database (solo se modifichi il codice)

Lo schema si trova in `src/core/db.js`. Per aggiungere tabelle o campi crea un nuovo blocco `db.version(N+1)` con la sua funzione `upgrade`, e aggiorna `SCHEMA_VERSION`. Non modificare mai una versione già pubblicata.

---

## 14. Problemi comuni e soluzioni

### L'app si apre in Safari invece che a schermo intero

All'aggiunta alla Home l'interruttore **"Apri come app web"** era spento. Elimina l'icona (con i dati: fai prima un backup, se ne avevi già inseriti) e aggiungila di nuovo con l'interruttore attivo (capitolo 7.1).

### I dati sono spariti

- Controlla di aver aperto Vita **dall'icona** e non da Safari.
- Dopo un errore tuo (importazione o cancellazione sbagliata) usa **Impostazioni → Copie automatiche interne**.
- Se l'icona era stata eliminata, reinstalla e ripristina l'ultimo backup.

### "Invia prova dal server" dà errore

| Messaggio | Soluzione |
|---|---|
| `401` / non autorizzato | Il token è sbagliato: copia di nuovo `APP_TOKEN` |
| Errore di rete | Controlla l'indirizzo del server e che `ALLOWED_ORIGIN` sia esattamente `https://TUO-UTENTE.github.io`, poi `npm run deploy` |
| Dispositivo non registrato | Tocca **Disattiva** e poi **Attiva notifiche in background** |

Per vedere in diretta cosa succede sul server (solo mentre il comando è in esecuzione, niente viene salvato):

```bash
cd ~/vita/worker && npm run logs
```

### Le notifiche non arrivano ad app chiusa

1. L'app è installata sulla Home e il permesso è "Consentite"? Lo vedi in Impostazioni di Vita.
2. Impostazioni iOS → Notifiche → Vita: è tutto attivo?
3. È attiva una modalità Full immersion che blocca Vita?
4. Hai aperto Vita negli ultimi 14 giorni?
5. In Vita: "Promemoria attivi", l'interruttore del modulo e gli orari silenziosi sono impostati come vuoi?
6. Dopo una reinstallazione dell'app: Disattiva e poi Attiva notifiche in background.

### Le notifiche mostrano "Hai un promemoria" senza testo

L'iPhone non ha trovato la chiave per decifrare: succede dopo un ripristino o una reinstallazione. Vai in **Impostazioni → Sincronizza promemoria ora**. Se non basta, Disattiva e poi Attiva notifiche in background.

### Vedo ancora la versione vecchia

1. Chiudi Vita dal multitasking e riaprila.
2. Vai in **Impostazioni → Controlla aggiornamenti** e tocca **Aggiorna** nel banner.
3. Se ancora non cambia: **Impostazioni → Riavvia l'app**.

### Face ID non si attiva

- Prima imposta il PIN.
- Funziona solo dall'app installata, all'indirizzo `https://`.
- Dopo una reinstallazione, disattiva e riattiva Face ID.

### La voce delle meditazioni non si sente

- Controlla l'interruttore silenzioso e il volume.
- Per una voce migliore: Impostazioni iOS → Accessibilità → Contenuto letto ad alta voce → Voci → Italiano, e scarica una voce "migliorata".

### Il calendario da indirizzo web dà errore

- In Impostazioni → Calendari tocca **Usa indirizzo e token del server notifiche**.
- Controlla che l'indirizzo sia quello **segreto iCal** di Google o il link pubblico di iCloud.

### La pubblicazione su GitHub è rossa

- Apri **Actions** nel repository, clicca sull'esecuzione e leggi il passo fallito.
- Di solito è un test: esegui `npm test` sul PC, correggi e rifai `git push`.

---

## 15. Checklist mensile

- [ ] **Backup cifrato** su iCloud Drive; controlla che il file abbia la data di oggi.
- [ ] Ogni 3 mesi: prova a **ripristinare** un backup per verificare che la password funzioni.
- [ ] **Impostazioni → Installazione e archiviazione:** app installata ✅ e spazio usato.
- [ ] **Invia notifica di prova** e **Invia prova dal server**.
- [ ] **Finanze → Pianifica:** disattiva gli abbonamenti che non usi più.
- [ ] Rivedi **budget** e **obiettivi** del mese.
- [ ] Sul PC: `npm outdated`, `npm update`, `npm audit`, `npm test`, `git push`.
- [ ] Server: `cd ~/vita/worker && npm update && npm run deploy`.
- [ ] Elimina dalla cartella iCloud i backup più vecchi di 6 mesi, tenendone almeno 3.
- [ ] Elimina eventuali **CSV** non cifrati rimasti in File.
- [ ] Una volta l'anno: cambia le chiavi del server (capitolo 13.5).

---

## 16. Appendice A – Provare l'app sull'iPhone in rete locale

Facoltativa: serve solo se vuoi provare l'app prima di pubblicarla.

### Prova rapida (senza notifiche, Face ID e funzionamento offline)

```bash
hostname -I
cd ~/vita && npm run dev
```

Annota il primo indirizzo che compare, per esempio `192.168.1.50`. Sull'iPhone, connesso allo stesso Wi‑Fi, apri Safari su `http://192.168.1.50:5173`.

Se non si apre e sul PC hai un firewall:

```bash
sudo ufw allow 5173/tcp
```

### Prova completa con HTTPS

1. Crea i certificati, sostituendo l'indirizzo con il tuo:

```bash
sudo apt install -y mkcert libnss3-tools
mkcert -install
cd ~/vita && mkdir -p certs
mkcert -key-file certs/key.pem -cert-file certs/cert.pem 192.168.1.50 localhost
python3 -m http.server 8000 --directory "$(mkcert -CAROOT)"
```

2. Sull'iPhone apri `http://192.168.1.50:8000/rootCA.pem` e tocca **Consenti**.
3. Vai in **Impostazioni → Profilo scaricato → Installa**.
4. Vai in **Impostazioni → Generali → Info → Impostazioni attendibilità certificati** e attiva "mkcert".
5. Sul PC premi `Ctrl+C` e lancia:

```bash
npm run build && npm run preview
```

6. Sull'iPhone apri `https://192.168.1.50:4173`.

Quando hai finito, rimuovi il profilo da **Impostazioni → Generali → VPN e gestione dispositivi**. La cartella `certs` non viene mai pubblicata.

---

## 17. Appendice B – Struttura del progetto

```
vita/
├── .github/workflows/deploy.yml   Pubblicazione automatica: test → build → GitHub Pages
├── GUIDA.md                       Questa guida
├── FUNZIONALITA.md                Elenco di tutte le funzioni
├── README.md
├── index.html                     Pagina principale, schermate di avvio iOS, regole di sicurezza (CSP)
├── package.json                   Script e dipendenze (dexie, hash-wasm; vite, vitest, sharp)
├── vite.config.js                 Build, HTTPS locale, service worker con versione
├── public/
│   ├── manifest.webmanifest       Nome, icone, schermo intero
│   └── icons/icon.svg             Icona sorgente (i PNG si generano da soli)
├── scripts/gen-icons.mjs          Icone 180/192/512 e 22 schermate di avvio
├── src/
│   ├── main.js                    Avvio: archivio, blocco, navigazione, promemoria, aggiornamenti
│   ├── sw.js                      Funzionamento offline, ricezione e decifratura delle notifiche
│   ├── styles/app.css             Stile iOS, tema chiaro/scuro, accessibilità
│   ├── core/                      Archivio e migrazioni, interfaccia, blocco, backup, notifiche,
│   │                              calendario, finanze, archiviazione, tema, aggiornamenti, dati di esempio
│   ├── lib/                       Calcoli finanziari, ricorrenze, ICS, CSV, cifratura,
│   │                              cifratura dei promemoria, grafici
│   ├── data/                      415 frasi, 13 meditazioni
│   └── modules/                   Oggi, Finanze, Calendario, Routine, Mente, Note, Salute,
│                                  Diario, Revisione, Cerca, Impostazioni, Altro
├── tests/                         32 test automatici
└── worker/                        Server Cloudflare: notifiche + ponte calendari
    ├── wrangler.toml              Configurazione (nessun segreto)
    ├── package.json
    ├── scripts/gen-vapid.mjs      Genera chiavi e token
    └── src/index.js
```
