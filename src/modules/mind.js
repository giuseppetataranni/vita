// Mente: frase del giorno, meditazioni guidate con voce, umore, gratitudine, correlazioni
import { db, settings, setSetting, getMeta, setMeta } from '../core/db.js';
import { html, raw, esc, icon, bindActions, formSheet, toast, openSheet, pageHeader, iconBtn, segmented, swipeRow, empty, haptic } from '../core/ui.js';
import { ymd, today, addDays, fmtDate, diffDays, relDay, num, money, pad } from '../core/format.js';
import { QUOTES } from '../data/quotes.js';
import { MEDITATIONS, medDuration } from '../data/meditations.js';
import { line, scatter, pearson, corrLabel } from '../lib/charts.js';
import { routineRatioFn } from './routines.js';
import { go } from '../core/router.js';

const SUBS = [{ value: 'medita', label: 'Medita' }, { value: 'umore', label: 'Umore' }, { value: 'frasi', label: 'Frasi' }];
export const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
const dayNum = (d = new Date()) => diffDays(new Date(2020, 0, 1), d);

// ---------- Frasi ----------
async function allQuotes() {
  const own = await db.quotes.toArray();
  return [...QUOTES.map((q, i) => ({ key: `b${i}`, text: q[0], author: q[1] || '' })), ...own.map((q) => ({ key: `u${q.id}`, id: q.id, text: q.text, author: q.author || '', own: true }))];
}
export async function quoteOfDay(d = new Date()) {
  const all = await allQuotes();
  const q = all[(dayNum(d) * 7919) % all.length];
  const favs = new Set(await getMeta('favQuotes', []));
  return { ...q, fav: favs.has(q.key) };
}
export async function toggleFav(key) {
  const favs = new Set(await getMeta('favQuotes', []));
  favs.has(key) ? favs.delete(key) : favs.add(key);
  await setMeta('favQuotes', [...favs]);
  haptic();
  return favs.has(key);
}
export const medOfDay = (d = new Date()) => MEDITATIONS[dayNum(d) % MEDITATIONS.length];

// ---------- Umore ----------
export async function setMood(value, date = today()) {
  const ex = await db.moods.get(date);
  await db.moods.put({ ...(ex || {}), date, value, updatedAt: Date.now() });
  haptic();
}

// ---------- Audio e voce ----------
let audioCtx = null;
const getAudio = () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch { audioCtx = null; } return audioCtx; };
export function bell() {
  const ctx = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [f, g] of [[528, 0.25], [792, 0.12], [1056, 0.06]]) {
    const o = ctx.createOscillator(), v = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    o.connect(v).connect(ctx.destination); o.start(t); o.stop(t + 4.1);
  }
}
let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('it'));
  voice = vs.find((v) => /alice|federica|emma|luca/i.test(v.name)) || vs[0] || null;
  return voice;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
export function speak(text) {
  if (!settings.ttsOn || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'it-IT'; u.rate = settings.ttsRate || 0.9; u.pitch = 1;
  if (voice || pickVoice()) u.voice = voice;
  speechSynthesis.speak(u);
}

// ---------- Player meditazione ----------
export function playMeditation(m) {
  const total = medDuration(m);
  const bounds = []; let acc = 0;
  for (const [s] of m.steps) { bounds.push(acc); acc += s; }
  let elapsed = 0, running = false, last = 0, step = -1, timer = null, breathT = null, wake = null, finished = false;
  const fmt = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  return openSheet({
    title: m.title, full: true, cancel: 'Chiudi',
    body: String(html`<div class="med-player">
      <div class="breath" aria-hidden="true"><div class="orb"></div><div class="phase">${m.breath ? 'Pronto' : m.emoji}</div></div>
      <div class="med-time" aria-live="off">${fmt(total)}</div>
      <p class="med-step" aria-live="polite">${m.desc}</p>
      <div class="med-ctrl"><button class="icon-btn round" data-m="back" aria-label="Passo precedente">${icon('left')}</button><button class="play" data-m="play" aria-label="Avvia">${icon('play')}</button><button class="icon-btn round" data-m="fwd" aria-label="Passo successivo">${icon('right')}</button></div>
      <div class="list" style="margin-top:22px;text-align:left">
        <div class="field"><label for="tts">Voce guida</label><input type="checkbox" switch class="switch" id="tts" ${settings.ttsOn ? 'checked' : ''}></div>
        <div class="field full"><label for="rate">Velocità voce: <span data-rate>${num(settings.ttsRate, 2)}</span></label><input id="rate" type="range" min="0.6" max="1.2" step="0.05" value="${settings.ttsRate}"></div>
        ${m.breath ? html`<div class="field"><label for="bv">Annuncia le fasi del respiro</label><input type="checkbox" switch class="switch" id="bv" ${settings.breathVoice ? 'checked' : ''}></div>` : ''}
      </div></div>`),
    onMount: ({ el, close }) => {
      const orb = el.querySelector('.orb'), phase = el.querySelector('.phase'), time = el.querySelector('.med-time'), txt = el.querySelector('.med-step'), play = el.querySelector('[data-m="play"]');
      const setStep = (i) => { step = i; txt.textContent = m.steps[i][1]; speak(m.steps[i][1]); };
      const breathe = () => {
        if (!running || !m.breath) return;
        const seq = [['Inspira', m.breath.in, 1], ['Trattieni', m.breath.hold, 1], ['Espira', m.breath.out, 0.45], ['Pausa', m.breath.hold2, 0.45]].filter((p) => p[1] > 0);
        let k = 0;
        const next = () => {
          if (!running) return;
          const [label, dur, scale] = seq[k % seq.length];
          phase.textContent = label;
          orb.style.transitionDuration = `${dur}s`;
          orb.style.transform = `scale(${scale})`;
          if (settings.breathVoice && step >= 0) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(label); u.lang = 'it-IT'; u.rate = 1; if (voice) u.voice = voice; speechSynthesis.speak(u); }
          k++;
          breathT = setTimeout(next, dur * 1000);
        };
        next();
      };
      const loop = () => {
        const now = performance.now();
        elapsed += (now - last) / 1000; last = now;
        if (elapsed >= total) return finish();
        let i = bounds.length - 1;
        while (i > 0 && bounds[i] > elapsed) i--;
        if (i !== step) setStep(i);
        time.textContent = fmt(total - elapsed);
        timer = setTimeout(loop, 250);
      };
      const start = async () => {
        getAudio();
        running = true; last = performance.now();
        play.innerHTML = String(icon('pause')); play.setAttribute('aria-label', 'Pausa');
        if (!m.breath) { orb.style.transitionDuration = '6s'; orb.style.transform = 'scale(.8)'; }
        try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
        if (step < 0) setStep(0);
        loop(); breathe();
      };
      const pause = () => {
        running = false; clearTimeout(timer); clearTimeout(breathT);
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        play.innerHTML = String(icon('play')); play.setAttribute('aria-label', 'Riprendi');
        wake?.release?.().catch(() => {}); wake = null;
      };
      const finish = async () => {
        pause(); finished = true;
        elapsed = total; time.textContent = '0:00';
        phase.textContent = '✓'; orb.style.transform = 'scale(.7)';
        txt.textContent = 'Sessione completata. Prenditi un momento prima di ripartire.';
        bell(); speak('Sessione completata.');
        await saveSession(m, total);
        toast(`Meditazione registrata: ${Math.round(total / 60)} minuti`);
      };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        haptic();
        if (b.dataset.m === 'play') { if (finished) { elapsed = 0; step = -1; finished = false; } running ? pause() : start(); }
        if (b.dataset.m === 'fwd' && step < m.steps.length - 1) { elapsed = bounds[step + 1]; setStep(step + 1); }
        if (b.dataset.m === 'back' && step > 0) { elapsed = bounds[step - 1]; setStep(step - 1); }
      });
      el.querySelector('#tts').addEventListener('change', (e) => setSetting('ttsOn', e.target.checked));
      el.querySelector('#bv')?.addEventListener('change', (e) => setSetting('breathVoice', e.target.checked));
      const rate = el.querySelector('#rate');
      rate.addEventListener('input', () => { el.querySelector('[data-rate]').textContent = num(rate.value, 2); });
      rate.addEventListener('change', () => setSetting('ttsRate', Number(rate.value)));
      // Chiusura: salva la sessione parziale se dura almeno un minuto
      const obs = new MutationObserver(() => {
        if (!document.body.contains(el)) {
          obs.disconnect();
          if (running || (!finished && elapsed >= 60)) { const sec = elapsed; pause(); if (sec >= 60) saveSession(m, sec); }
        }
      });
      obs.observe(document.body, { childList: true });
    }
  });
}
async function saveSession(m, seconds) {
  await db.meditations.add({ date: today(), medId: m.id, title: m.title, minutes: Math.round((seconds / 60) * 10) / 10, at: Date.now() });
}
export async function meditationStats() {
  const list = await db.meditations.toArray();
  const days = new Set(list.map((x) => x.date));
  let streak = 0, d = new Date();
  if (!days.has(ymd(d))) d = addDays(d, -1);
  while (days.has(ymd(d))) { streak++; d = addDays(d, -1); }
  const minutes = list.reduce((a, x) => a + (x.minutes || 0), 0);
  const week = list.filter((x) => x.date >= ymd(addDays(new Date(), -6))).reduce((a, x) => a + (x.minutes || 0), 0);
  return { streak, minutes, sessions: list.length, week, doneToday: days.has(today()) };
}

// ---------- Viste ----------
async function meditaView() {
  const q = await quoteOfDay();
  const st = await meditationStats();
  const mod = medOfDay();
  return html`<div class="card"><h3>Frase del giorno <button class="icon-btn" data-act="fav" data-key="${q.key}" aria-label="${q.fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}" style="color:${q.fav ? 'var(--red)' : 'var(--text3)'}">${raw(String(icon('heart')).replace('fill="none"', `fill="${q.fav ? 'currentColor' : 'none'}"`))}</button></h3><div class="quote">${q.text}</div>${q.author ? html`<div class="quote-author">${q.author}</div>` : ''}</div>
  <div class="grid2" style="margin-top:12px"><div class="card stat"><div class="l">Giorni consecutivi</div><div class="v">🔥 ${st.streak}</div></div><div class="card stat"><div class="l">Minuti questa settimana</div><div class="v">${num(st.week)}</div></div><div class="card stat"><div class="l">Minuti totali</div><div class="v">${num(st.minutes)}</div></div><div class="card stat"><div class="l">Sessioni</div><div class="v">${st.sessions}</div></div></div>
  <h2 class="section-title">Meditazione del giorno</h2>
  <button class="card row has-ic" style="border-radius:var(--radius-lg)" data-act="play" data-id="${mod.id}"><span class="row-ic" style="font-size:1.5em;width:48px;height:48px">${mod.emoji}</span><span class="row-main wrap"><strong>${mod.title}</strong><small>${Math.round(medDuration(mod) / 60)} min · ${mod.desc}</small></span>${icon('play')}</button>
  <h2 class="section-title">Tutte le sessioni</h2>
  <div class="list">${MEDITATIONS.map((m) => html`<button class="row has-ic" data-act="play" data-id="${m.id}"><span class="row-ic">${m.emoji}</span><span class="row-main"><strong>${m.title}</strong><small>${m.category} · ${Math.round(medDuration(m) / 60)} min</small></span>${icon('chev', 'chev')}</button>`)}</div>
  <p class="caption">La voce usa la sintesi vocale italiana di iOS. Se non senti nulla, controlla l’interruttore silenzioso e il volume.</p>`;
}

async function moodView() {
  const t = today();
  const [mood, moods, grat, txs] = await Promise.all([db.moods.get(t), db.moods.where('date').aboveOrEqual(ymd(addDays(new Date(), -89))).toArray(), db.gratitude.orderBy('date').reverse().limit(60).toArray(), db.transactions.where('date').aboveOrEqual(ymd(addDays(new Date(), -89))).toArray()]);
  const ratio = await routineRatioFn(100);
  const byDate = new Map(moods.map((m) => [m.date, m.value]));
  const days = Array.from({ length: 30 }, (_, i) => addDays(new Date(), i - 29));
  const exp = new Map();
  for (const x of txs) if (x.type === 'expense') exp.set(x.date, (exp.get(x.date) || 0) + x.amount);
  const pairsR = [], pairsE = [];
  for (const m of moods) {
    const d = new Date(m.date + 'T12:00');
    const r = ratio(d);
    if (r != null) pairsR.push({ x: r * 100, y: m.value });
    pairsE.push({ x: exp.get(m.date) || 0, y: m.value });
  }
  const cR = pearson(pairsR), cE = pearson(pairsE);
  const todayGrat = grat.filter((g) => g.date === t);
  return html`<div class="card"><h3>Come stai oggi?</h3><div class="mood-row" role="radiogroup" aria-label="Umore di oggi">${MOODS.map((e, i) => html`<button class="${mood?.value === i + 1 ? 'on' : ''}" data-act="mood" data-v="${i + 1}" role="radio" aria-checked="${mood?.value === i + 1}" aria-label="Umore ${i + 1} su 5">${e}</button>`)}</div>
    ${mood ? html`<button class="btn small" style="margin-top:10px" data-act="moodNote">${mood.note ? `“${mood.note}”` : 'Aggiungi una nota'}</button>` : ''}</div>
  <div class="card"><h3>Gratitudine di oggi <button class="link" data-act="addGrat">Aggiungi</button></h3>${todayGrat.length ? html`<div class="list">${todayGrat.map((g) => swipeRow(html`<div class="row"><span class="row-main wrap"><strong>🙏 ${g.text}</strong></span></div>`, html`<button data-act="delGrat" data-id="${g.id}">Elimina</button>`))}</div>` : html`<p class="muted" style="margin:0">Tre piccole cose per cui sei grato oggi.</p>`}</div>
  <h2 class="section-title">Umore (30 giorni)</h2>
  <div class="card">${raw(line(days.map((d) => String(d.getDate())), days.map((d) => byDate.get(ymd(d)) ?? null), { min: 1, max: 5, fmt: (v) => MOODS[v - 1] }))}</div>
  <h2 class="section-title">Correlazioni</h2>
  <div class="card"><h3>Umore e routine completate</h3>${raw(scatter(pairsR, { xLabel: '% routine', yLabel: 'umore' }))}<p class="small" style="margin:8px 0 0">${cR == null ? 'Servono almeno 3 giorni con umore e routine.' : `Coefficiente ${num(cR, 2)}: ${corrLabel(cR)}.`}</p></div>
  <div class="card"><h3>Umore e spese del giorno</h3>${raw(scatter(pairsE, { xLabel: 'spesa €', yLabel: 'umore' }))}<p class="small" style="margin:8px 0 0">${cE == null ? 'Servono almeno 3 giorni di dati.' : `Coefficiente ${num(cE, 2)}: ${corrLabel(cE)}.`}</p></div>
  <p class="caption">Una correlazione indica che due cose tendono a variare insieme, non che una causi l’altra.</p>
  <h2 class="section-title">Diario della gratitudine</h2>
  ${grat.length ? html`<div class="list">${grat.map((g) => html`<div class="row"><span class="row-main wrap"><strong>${g.text}</strong><small>${relDay(g.date)}</small></span></div>`)}</div>` : empty('🙏', 'Ancora nessuna voce')}`;
}

async function quotesView() {
  const all = await allQuotes();
  const favs = new Set(await getMeta('favQuotes', []));
  const favList = all.filter((q) => favs.has(q.key));
  const own = all.filter((q) => q.own);
  const qRow = (q) => swipeRow(html`<div class="row"><span class="row-main wrap"><strong style="font-weight:400">${q.text}</strong>${q.author ? html`<small>${q.author}</small>` : ''}</span></div>`,
    html`<button class="alt" data-act="fav" data-key="${q.key}">${favs.has(q.key) ? 'Togli ♥' : '♥'}</button>${q.own ? html`<button data-act="delQuote" data-id="${q.id}">Elimina</button>` : ''}`);
  return html`<div class="btn-row"><button class="btn tinted" data-act="addQuote">${icon('plus')} Aggiungi una tua frase</button><button class="btn" data-act="random">Frase casuale</button></div>
  <h2 class="section-title">Preferite</h2>${favList.length ? html`<div class="list">${favList.map(qRow)}</div>` : empty('❤️', 'Tocca il cuore sulla frase del giorno o scorri una frase verso sinistra')}
  <h2 class="section-title">Le tue frasi</h2>${own.length ? html`<div class="list">${own.map(qRow)}</div>` : empty('✍️', 'Le frasi che aggiungi entrano nella rotazione quotidiana')}
  <p class="caption">${all.length} frasi in rotazione, una diversa ogni giorno.</p>`;
}

export async function render(root, route, ctx) {
  const sub = SUBS.some((s) => s.value === route.sub) ? route.sub : 'medita';
  const body = await { medita: meditaView, umore: moodView, frasi: quotesView }[sub]();
  root.innerHTML = String(html`${pageHeader('Mente', { back: { href: '#/altro', label: 'Altro' } })}<main class="page"><div class="seg-wrap">${segmented(SUBS, sub, 'sub')}</div>${body}</main>`);
  const refresh = () => ctx.rerender();
  return bindActions(root, {
    sub: ({ value }) => go(`#/mente/${value}`),
    play: ({ id }) => playMeditation(MEDITATIONS.find((m) => m.id === id)).then(refresh),
    fav: async ({ key }) => { toast((await toggleFav(key)) ? 'Aggiunta ai preferiti' : 'Rimossa dai preferiti'); refresh(); },
    mood: async ({ v }) => { await setMood(Number(v)); refresh(); },
    moodNote: async () => {
      const m = await db.moods.get(today());
      const r = await formSheet({ title: 'Nota sull’umore', values: m, fields: [{ name: 'note', label: 'Cosa ha influito oggi?', type: 'textarea', rows: 3, autofocus: true }] });
      if (r) { await db.moods.put({ ...m, note: r.note }); refresh(); }
    },
    addGrat: async () => { if (await addGratitude()) refresh(); },
    delGrat: async ({ id }) => { await db.gratitude.delete(Number(id)); refresh(); },
    addQuote: async () => {
      const r = await formSheet({ title: 'Nuova frase', fields: [{ name: 'text', label: 'Frase', type: 'textarea', rows: 3, required: true, autofocus: true }, { name: 'author', label: 'Autore' }] });
      if (r) { await db.quotes.add({ ...r, createdAt: Date.now() }); toast('Frase aggiunta'); refresh(); }
    },
    delQuote: async ({ id }) => { await db.quotes.delete(Number(id)); refresh(); },
    random: async () => { const all = await allQuotes(); const q = all[Math.floor(Math.random() * all.length)]; openSheet({ title: 'Frase', body: String(html`<div class="card"><div class="quote">${q.text}</div>${q.author ? html`<div class="quote-author">${q.author}</div>` : ''}</div>`) }); }
  });
}

export async function addGratitude() {
  const r = await formSheet({ title: 'Gratitudine', submitLabel: 'Salva', fields: [{ name: 'a', label: '1.', autofocus: true, required: true }, { name: 'b', label: '2.' }, { name: 'c', label: '3.' }] });
  if (!r) return false;
  for (const t of [r.a, r.b, r.c].filter(Boolean)) await db.gratitude.add({ date: today(), text: t, createdAt: Date.now() });
  toast('Gratitudine salvata');
  return true;
}
