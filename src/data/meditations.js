// Meditazioni guidate: steps = [secondi, testo]; breath = ritmo del respiro in secondi
export const MEDITATIONS = [
  {
    id: '478', title: 'Respiro 4-7-8', emoji: '🌬️', category: 'Respiro', desc: 'Calma il sistema nervoso in pochi minuti. Ottimo prima di dormire.',
    breath: { in: 4, hold: 7, out: 8, hold2: 0 },
    steps: [
      [15, 'Siediti comodo, schiena dritta ma morbida. Appoggia la punta della lingua dietro i denti superiori.'],
      [15, 'Espira completamente dalla bocca, lasciando uscire tutta l’aria.'],
      [60, 'Inspira dal naso per quattro secondi. Trattieni per sette. Espira dalla bocca per otto, lentamente.'],
      [60, 'Segui il cerchio: si espande quando inspiri, resta fermo quando trattieni, si ritira quando espiri.'],
      [60, 'Se ti gira un po’ la testa, respira normalmente per qualche istante e poi riprendi.'],
      [30, 'Ultimi respiri. Nota come il corpo si è fatto più pesante e tranquillo.'],
      [15, 'Torna al tuo respiro naturale. Bene così.']
    ]
  },
  {
    id: 'box', title: 'Box breathing', emoji: '🟦', category: 'Respiro', desc: 'Respiro quadrato 4-4-4-4 per ritrovare lucidità e controllo.',
    breath: { in: 4, hold: 4, out: 4, hold2: 4 },
    steps: [
      [15, 'Immagina un quadrato. Percorrerai un lato per ogni fase del respiro.'],
      [60, 'Inspira contando fino a quattro. Trattieni quattro. Espira quattro. Resta vuoto quattro.'],
      [60, 'Mantieni il ritmo regolare, senza forzare. Le spalle restano rilassate.'],
      [60, 'Se la mente si distrae, torna semplicemente a contare.'],
      [60, 'Continua così: ogni lato del quadrato ti rende più stabile.'],
      [15, 'Lascia andare il conteggio e respira liberamente.']
    ]
  },
  {
    id: 'coerenza', title: 'Respiro coerente', emoji: '💗', category: 'Respiro', desc: 'Cinque secondi dentro, cinque fuori: equilibrio per cuore e mente.',
    breath: { in: 5, hold: 0, out: 5, hold2: 0 },
    steps: [
      [15, 'Appoggia una mano sul petto e una sulla pancia.'],
      [90, 'Inspira per cinque secondi lasciando gonfiare la pancia. Espira per cinque secondi.'],
      [90, 'Immagina che l’aria entri ed esca dalla zona del cuore, morbida e regolare.'],
      [60, 'Porta alla mente qualcosa o qualcuno per cui provi affetto, e continua a respirare.'],
      [15, 'Rimani ancora un momento in questa sensazione di calore.']
    ]
  },
  {
    id: 'bodyscan', title: 'Body scan', emoji: '🧍', category: 'Consapevolezza', desc: 'Un viaggio di attenzione dalla testa ai piedi per sciogliere le tensioni.',
    steps: [
      [20, 'Sdraiati o siediti comodo. Chiudi gli occhi e fai tre respiri profondi.'],
      [40, 'Porta l’attenzione alla fronte, agli occhi, alla mascella. Lascia che si ammorbidiscano.'],
      [40, 'Scendi al collo e alle spalle. Nota se c’è tensione e lasciala scivolare via con l’espirazione.'],
      [40, 'Senti le braccia, i gomiti, le mani, fino alla punta delle dita. Pesanti e calde.'],
      [40, 'Osserva il petto che si alza e si abbassa. Poi la pancia, morbida.'],
      [40, 'Porta l’attenzione alla schiena, vertebra dopo vertebra, fino al bacino.'],
      [40, 'Scendi alle gambe: cosce, ginocchia, polpacci. Lasciale affondare.'],
      [30, 'Infine i piedi: talloni, piante, dita. Senti il contatto con il pavimento.'],
      [30, 'Ora senti il corpo intero, come un’unica presenza che respira.'],
      [20, 'Muovi piano le dita delle mani e dei piedi. Quando vuoi, apri gli occhi.']
    ]
  },
  {
    id: 'gratitudine', title: 'Gratitudine', emoji: '🙏', category: 'Emozioni', desc: 'Allena lo sguardo verso ciò che di buono c’è già.',
    steps: [
      [20, 'Respira con calma e lascia che il corpo si assesti.'],
      [45, 'Pensa a una persona che ti ha fatto del bene. Rivedi il suo volto e ringraziala in silenzio.'],
      [45, 'Pensa a qualcosa di semplice di oggi: un pasto, una luce, una parola. Assapora quel ricordo.'],
      [45, 'Pensa a qualcosa del tuo corpo che ti permette di vivere: il respiro, le mani, i passi.'],
      [45, 'Pensa a una difficoltà che ti ha insegnato qualcosa. Riconosci ciò che hai imparato.'],
      [30, 'Nota la sensazione di calore nel petto. È tua, puoi tornarci quando vuoi.'],
      [15, 'Se ti va, scrivi tre cose nel diario della gratitudine.']
    ]
  },
  {
    id: 'ansia', title: 'Calmare l’ansia', emoji: '🌊', category: 'Emozioni', desc: 'Tecnica 5-4-3-2-1 e respiro lungo per tornare al presente.',
    breath: { in: 4, hold: 0, out: 6, hold2: 0 },
    steps: [
      [20, 'Va tutto bene. Sei al sicuro, in questo momento. Allunga l’espirazione più dell’inspirazione.'],
      [35, 'Guardati intorno e nomina cinque cose che vedi.'],
      [30, 'Ora quattro cose che puoi toccare. Senti la loro consistenza.'],
      [30, 'Tre suoni che riesci a sentire, vicini o lontani.'],
      [25, 'Due profumi o odori, anche leggeri.'],
      [20, 'Un sapore che senti in bocca.'],
      [60, 'Torna al respiro: quattro secondi dentro, sei fuori. L’onda sale e poi scende.'],
      [30, 'I pensieri ansiosi sono come onde: arrivano, raggiungono il picco, si ritirano.'],
      [20, 'Ripeti dentro di te: questo passerà. Io resto.']
    ]
  },
  {
    id: 'sonno', title: 'Verso il sonno', emoji: '🌙', category: 'Sonno', desc: 'Rilassamento progressivo per addormentarsi più facilmente.',
    breath: { in: 4, hold: 2, out: 6, hold2: 0 },
    steps: [
      [25, 'Spegni le luci, sdraiati. Lascia che il letto sostenga tutto il tuo peso.'],
      [45, 'Stringi forte i pugni per cinque secondi… e lascia andare. Senti la differenza.'],
      [45, 'Solleva le spalle verso le orecchie… e lasciale cadere. Ancora una volta.'],
      [45, 'Contrai i muscoli delle gambe… e rilascia. Le gambe diventano pesanti.'],
      [60, 'Immagina di scendere una scala lenta. Ad ogni gradino sei più rilassato.'],
      [60, 'Ogni espirazione è più lunga della precedente. Non devi fare niente.'],
      [60, 'Lascia che i pensieri si dissolvano come nebbia al mattino.'],
      [30, 'Buonanotte.']
    ]
  },
  {
    id: 'focus', title: 'Focus', emoji: '🎯', category: 'Concentrazione', desc: 'Prepara la mente prima di studiare o lavorare.',
    steps: [
      [20, 'Siediti con la schiena dritta. Appoggia i piedi a terra.'],
      [60, 'Conta i respiri da uno a dieci. Ogni volta che ti distrai, ricomincia da uno, senza giudicarti.'],
      [60, 'Continua a contare. Distrarsi è normale: il momento in cui te ne accorgi è l’allenamento.'],
      [40, 'Ora pensa al compito che stai per iniziare. Qual è il primo, piccolissimo passo?'],
      [30, 'Immagina di completarlo con calma e attenzione.'],
      [20, 'Apri gli occhi. Inizia da quel primo passo, adesso.']
    ]
  },
  {
    id: 'camminata', title: 'Camminata consapevole', emoji: '🚶', category: 'Movimento', desc: 'Da fare camminando piano, in casa o all’aperto.',
    steps: [
      [25, 'Stai in piedi, fermo. Senti il peso distribuito sui due piedi.'],
      [45, 'Inizia a camminare lentamente. Nota il tallone che tocca terra, poi la pianta, poi le dita.'],
      [45, 'Coordina il respiro con i passi: due passi inspirando, due passi espirando.'],
      [45, 'Allarga l’attenzione ai suoni intorno a te, senza fermarti.'],
      [45, 'Nota l’aria sulla pelle, la temperatura, la luce.'],
      [45, 'Se la mente vaga, torna alla sensazione dei piedi.'],
      [30, 'Rallenta fino a fermarti. Senti il corpo vivo e presente.']
    ]
  },
  {
    id: 'gentilezza', title: 'Gentilezza amorevole', emoji: '💛', category: 'Emozioni', desc: 'Metta: augura il bene a te e agli altri.',
    steps: [
      [20, 'Respira dolcemente e porta una mano sul cuore.'],
      [45, 'Ripeti dentro di te: che io possa stare bene. Che io possa essere sereno. Che io possa essere gentile con me.'],
      [45, 'Pensa a una persona cara. Che tu possa stare bene. Che tu possa essere sereno.'],
      [45, 'Pensa a una persona che conosci appena. Augurale lo stesso, con sincerità.'],
      [45, 'Pensa a una persona con cui hai un attrito. Che anche tu possa stare bene.'],
      [40, 'Allarga l’augurio a tutti gli esseri: che tutti possano stare bene.'],
      [15, 'Resta in questa sensazione di apertura.']
    ]
  },
  {
    id: 'pausa', title: 'Pausa di 3 minuti', emoji: '⏸️', category: 'Consapevolezza', desc: 'Una sosta veloce nella giornata piena.',
    steps: [
      [60, 'Fermati. Cosa stai pensando? Cosa senti? Nota tutto, senza cambiare niente.'],
      [60, 'Raccogli l’attenzione sul respiro, nella pancia. Segui ogni inspirazione e ogni espirazione.'],
      [60, 'Allarga l’attenzione a tutto il corpo, alla postura, all’espressione del viso. Poi riprendi la giornata.']
    ]
  },
  {
    id: 'risveglio', title: 'Risveglio', emoji: '🌅', category: 'Mattino', desc: 'Inizia la giornata con energia e un’intenzione chiara.',
    breath: { in: 4, hold: 1, out: 4, hold2: 0 },
    steps: [
      [20, 'Seduto sul bordo del letto, apri le mani sulle ginocchia.'],
      [45, 'Fai respiri pieni e vivaci. Senti l’energia che entra con l’aria.'],
      [30, 'Allunga le braccia verso l’alto, poi lasciale scendere.'],
      [45, 'Pensa a una cosa per cui sei grato stamattina.'],
      [45, 'Scegli un’intenzione per oggi: una parola, come calma, coraggio, cura.'],
      [15, 'Porta questa parola con te. Buona giornata.']
    ]
  },
  {
    id: 'montagna', title: 'La montagna', emoji: '⛰️', category: 'Consapevolezza', desc: 'Stabilità interiore anche quando fuori cambia il tempo.',
    steps: [
      [20, 'Siediti stabile, come una montagna: base larga, cima dritta.'],
      [50, 'Immagina una montagna che ami. La sua base profonda, i fianchi, la vetta nel cielo.'],
      [50, 'Diventa quella montagna. Il respiro è il vento che passa sui suoi pendii.'],
      [50, 'Le stagioni cambiano: neve, pioggia, sole, nuvole. La montagna resta.'],
      [50, 'Le emozioni sono come il tempo atmosferico. Tu sei la montagna che le osserva.'],
      [20, 'Porta con te questa stabilità.']
    ]
  }
];
export const medDuration = (m) => m.steps.reduce((a, s) => a + s[0], 0);
