/* ============================================================
   نادي الجبال — التنفس العميق (طريقة ويم هوف)
   ▸ الجولة: أنفاس بطنية عميقة ← حبس النفس بعد الزفير ← نفَس استشفاء
   ▸ الجلسة قابلة للتخصيص: الجولات، الأنفاس، السرعة، نوع الحبس، الاستشفاء
   ▸ للتبويب لوحة ألوان مستقلة عن هوية الجبل (body[data-zone="breath"])
   ▸ الجلسات خاصة: users/{uid}/breaths — نفس قاعدة بيانات المستخدم
   ============================================================ */

import { L, LOC, SPEECH, lang } from "./i18n.js";

let C = null;

export const BREATH_LK = "hejaz.breaths";           // سجل الجلسات — يُمسح مع بيانات المستخدم
const CFG_LK = "hejaz.breath.cfg";                  // إعداد الجلسة — تفضيل جهاز
const OK_LK  = "hejaz.breath.ok";                   // قرأ تنبيه السلامة
export const BREATH_META = { light:"#EAF5F6", dark:"#06151B" };

const KEEP   = 200;                                 // أقصى عدد جلسات محفوظة
const SHOW   = 8;                                   // جلسات تظهر قبل «عرض المزيد»
const MIN_S  = .56, MAX_S = 1;                      // حجم الكرة: زفير كامل ← شهيق كامل
const READY  = 5;                                   // ثوانٍ للاستعداد قبل أول جولة
const RELEASE = 3;                                  // إطلاق النفس بعد الاستشفاء
const CIRC   = 2 * Math.PI * 104;                   // محيط حلقة العدّ

const PACES = {
  calm: { inh:2.2, exh:1.8 },
  mid:  { inh:1.7, exh:1.3 },
  fast: { inh:1.3, exh:0.9 }
};
const LIMITS = { rounds:[1,8,1], breaths:[15,60,5], hold:[30,300,15], recover:[10,30,5] };
const PRESETS = [
  { k:"easy",    name:"مبتدئ",     cfg:{ rounds:2, breaths:25, pace:"calm", holdMode:"free",  hold:60,  holdInc:false, recover:15 } },
  { k:"classic", name:"الكلاسيكي", cfg:{ rounds:3, breaths:30, pace:"mid",  holdMode:"free",  hold:90,  holdInc:false, recover:15 } },
  { k:"ladder",  name:"متدرّج",    cfg:{ rounds:4, breaths:30, pace:"mid",  holdMode:"fixed", hold:60,  holdInc:true,  recover:15 } },
  { k:"deep",    name:"متقدّم",    cfg:{ rounds:4, breaths:40, pace:"fast", holdMode:"free",  hold:120, holdInc:false, recover:20 } }
];
const DEF = { ...PRESETS[1].cfg, voice:true, tone:true, vibe:true };
const HOLD_STEP = 15;                               // زيادة الحبس المحدد كل جولة

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s/60) + ":" + String(s%60).padStart(2, "0"); };
const ease = t => (1 - Math.cos(Math.PI * clamp(t, 0, 1))) / 2;
function lsGet(k, fb){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e){ return fb; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

/* ============================================================
   الإعداد
   ============================================================ */
function cleanCfg(c){
  c = { ...DEF, ...(c || {}) };
  const n = (k, v) => { const [a, b, st] = LIMITS[k]; v = Math.round((+v || a) / st) * st; return clamp(v, a, b); };
  return {
    rounds:   n("rounds", c.rounds),
    breaths:  n("breaths", c.breaths),
    pace:     PACES[c.pace] ? c.pace : "mid",
    holdMode: c.holdMode === "fixed" ? "fixed" : "free",
    hold:     n("hold", c.hold),
    holdInc:  !!c.holdInc,
    recover:  n("recover", c.recover),
    voice:    c.voice !== false,
    tone:     c.tone !== false,
    vibe:     c.vibe !== false
  };
}
let cfg = cleanCfg(lsGet(CFG_LK, null));
const saveCfg = () => lsSet(CFG_LK, cfg);

function presetOf(c){
  const p = PRESETS.find(({ cfg:x }) =>
    x.rounds === c.rounds && x.breaths === c.breaths && x.pace === c.pace &&
    x.holdMode === c.holdMode && x.recover === c.recover &&
    (c.holdMode === "free" || (x.hold === c.hold && x.holdInc === c.holdInc)));
  return p ? p.k : "custom";
}

const holdFor = (c, round) => c.holdMode === "fixed" ? c.hold + (c.holdInc ? HOLD_STEP * (round - 1) : 0) : 0;

function estMinutes(c){
  const pc = PACES[c.pace], cyc = pc.inh + pc.exh;
  let s = READY;
  for (let r = 1; r <= c.rounds; r++){
    s += c.breaths * cyc + (c.holdMode === "fixed" ? holdFor(c, r) : 75) + c.recover + RELEASE;
  }
  return Math.max(1, Math.round(s / 60));
}

/* ============================================================
   التخزين — محلي دائماً، وسحابي عند تسجيل الدخول
   ============================================================ */
function clean(b){
  const holds = Array.isArray(b.holds) ? b.holds.map(x => clamp(Math.round(+x || 0), 0, 1800)).slice(0, 8) : [];
  return {
    id: String(b.id),
    at: +b.at || Date.now(),
    breaths: clamp(Math.round(+b.breaths || 30), 1, 100),
    pace: PACES[b.pace] ? b.pace : "mid",
    recover: clamp(Math.round(+b.recover || 15), 0, 60),
    holds,
    dur: clamp(Math.round(+b.dur || 0), 0, 7200)
  };
}
const sortList = () => C.S.breaths.sort((a, b) => b.at - a.at);

/* يُستدعى من loadAll بالتوازي مع الباقي */
export async function loadBreaths(){
  const S = C.S;
  S.breaths = lsGet(BREATH_LK, []).map(clean);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try {
      const snap = await m.getDocs(m.query(m.collection(db, "users", S.user.uid, "breaths"),
                                           m.orderBy("at", "desc"), m.limit(KEEP)));
      S.breaths = snap.docs.map(d => clean({ id:d.id, ...d.data() }));
      lsSet(BREATH_LK, S.breaths);
    } catch(err){ console.error("loadBreaths", err); }
  }
  sortList();
}

async function putSession(b){
  const S = C.S;
  b = clean(b);
  S.breaths = [b, ...S.breaths.filter(x => x.id !== b.id)];
  sortList();
  S.breaths = S.breaths.slice(0, KEEP);
  lsSet(BREATH_LK, S.breaths);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    const { id, ...data } = b;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "breaths", id), data); }
    catch(err){ console.error(err); C.toast(L("انحفظ محلياً — تعذّر الحفظ في السحابة")); }
  }
}

async function dropSession(id){
  const S = C.S;
  S.breaths = S.breaths.filter(b => b.id !== id);
  lsSet(BREATH_LK, S.breaths);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "breaths", id)); }
    catch(err){ console.error(err); C.toast(L("انحذف محلياً — تعذّر الحذف من السحابة")); }
  }
}

/* ============================================================
   الإحصائيات
   ============================================================ */
const bestOf = b => b.holds.length ? Math.max(...b.holds) : 0;
function stats(){
  const list = C.S.breaths || [];
  const weekAgo = Date.now() - 7 * 86400000;
  return {
    count: list.length,
    best: list.reduce((a, b) => Math.max(a, bestOf(b)), 0),
    week: list.filter(b => b.at >= weekAgo).length
  };
}

/* ============================================================
   الصوت والاهتزاز وإبقاء الشاشة
   ============================================================ */
let ax = null;
function audio(){
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    if (!ax) ax = new A();
    if (ax.state === "suspended") ax.resume();
    return ax;
  } catch(e){ return null; }
}
/* نغمة تنزلق مع النفَس: تصعد مع الشهيق وتهبط مع الزفير */
function glide(f1, f2, dur, vol){
  if (!R || !R.cfg.tone) return;
  const a = audio(); if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.3, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + .05);
  } catch(e){}
}
/* جرس ناعم عند تغيّر المرحلة */
function chime(f, vol = .08, dur = 1.1){
  if (!R || !R.cfg.tone) return;
  const a = audio(); if (!a) return;
  try {
    [[f, vol], [f * 2.01, vol * .3]].forEach(([fr, v]) => {
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + .02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + dur + .05);
    });
  } catch(e){}
}
const tick = () => chime(880, .045, .18);

let voice = null;
function pickVoice(){
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices() || [];
  const pre = lang() === "en" ? /^en/i : /^ar/i;
  voice = vs.find(v => pre.test(v.lang)) || null;
}
if ("speechSynthesis" in window){
  pickVoice();
  speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", pickVoice);
}
function say(text){
  if (!R || !R.cfg.voice || !text || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH(); u.rate = .92; u.pitch = .95;
    if (voice) u.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch(e){}
}
function hush(){ try { "speechSynthesis" in window && speechSynthesis.cancel(); } catch(e){} }
function vib(p){ if (R && R.cfg.vibe) try { navigator.vibrate && navigator.vibrate(p); } catch(e){} }

let wake = null;
function keepAwake(on){
  try {
    if (on && navigator.wakeLock && !wake){
      navigator.wakeLock.request("screen").then(s => {
        wake = s; s.addEventListener("release", () => { wake = null; });
      }).catch(() => {});
    } else if (!on && wake){ wake.release().catch(() => {}); wake = null; }
  } catch(e){}
}

/* ============================================================
   المحرّك
   ============================================================
   المراحل: ready ← breathe ← hold ← recover ← release ← (الجولة التالية | done)
   الزمن يُحسب من ساعة الجهاز، فلا ينحرف لو تأخّر الرسم. */
let R = null;          // الجلسة الجارية
let raf = 0;
let shown = SHOW;      // عدد الجلسات الظاهرة في السجل
let howOpen = false;   // حالة «كيف تعمل»

const PHASE = {
  ready:   { label:"استعد",       tip:"اجلس أو استلقِ براحة، وأرخِ كتفيك." },
  in:      { label:"شهيق",        tip:"شهيق عميق — املأ البطن أولاً ثم الصدر." },
  out:     { label:"زفير",        tip:"أطلق الهواء بلا جهد، ولا تفرّغ رئتيك بالقوة." },
  hold:    { label:"احبس",        tip:"بعد الزفير احبس نفسك. استرخِ وراقب جسمك." },
  recover: { label:"نفَس الاستشفاء", tip:"شهيق كامل واحبسه — اشعر بالأكسجين يملأ جسمك." },
  release: { label:"أطلق",        tip:"أطلق النفس ببطء واسترخِ." }
};

function start(){
  audio();                                        // يفتح الصوت داخل ضغطة المستخدم (iOS)
  R = {
    cfg: { ...cfg },
    round: 1, phase: "", pt: 0, beat: -1, last: performance.now(),
    paused: false, holds: [], active: 0, view: {}
  };
  keepAwake(true);
  $("breathBox").innerHTML = runHTML();
  enter("ready");
  loop();
}

function loop(){
  cancelAnimationFrame(raf);
  const f = now => {
    if (!R || R.phase === "done") return;
    const dt = Math.max(0, (now - R.last) / 1000);
    R.last = now;
    if (!R.paused){ R.pt += dt; R.active += dt; }
    step();
    raf = requestAnimationFrame(f);
  };
  R.last = performance.now();
  raf = requestAnimationFrame(f);
}

function enter(ph){
  R.phase = ph; R.pt = 0; R.beat = -1;
  const c = R.cfg;
  if (ph === "ready"){ say(L("اجلس براحة وأغمض عينيك. نبدأ")); }
  if (ph === "breathe"){ say(L("الجولة {0}. تنفّس بعمق", R.round)); vib(30); }
  if (ph === "hold"){
    chime(392, .09, 1.6); vib([40, 60, 40]);
    say(c.holdMode === "fixed" ? L("أطلق واحبس {0} ثانية", holdFor(c, R.round)) : L("أطلق واحبس"));
  }
  if (ph === "recover"){ chime(523, .08, 1.2); vib(40); say(L("شهيق عميق واحبس")); }
  if (ph === "release"){ chime(659, .06, 1); say(L("أطلق")); }
  paintFrame();
}

function recordHold(sec){
  R.holds[R.round - 1] = Math.max(1, Math.round(sec));
  paintRounds();
}

function step(){
  const c = R.cfg, pc = PACES[c.pace], v = R.view;
  switch (R.phase){
    case "ready": {
      const left = READY - R.pt;
      const sec = Math.ceil(left);
      if (sec !== R.beat && sec > 0){ R.beat = sec; if (sec <= 3) tick(); }
      setPh("ready"); setOrb(.72 + .03 * Math.sin(R.pt * 1.4));
      setBig(Math.max(1, sec)); setSmall(L("استعد")); setRing(left / READY);
      if (left <= 0) enter("breathe");
      break;
    }
    case "breathe": {
      const cyc = pc.inh + pc.exh;
      const i = Math.floor(R.pt / cyc), p = R.pt - i * cyc;
      if (i >= c.breaths){ enter("hold"); break; }
      const inh = p < pc.inh;
      const half = i * 2 + (inh ? 0 : 1);
      if (half !== R.beat){
        R.beat = half;
        if (inh) glide(196, 294, pc.inh * .95, .05);
        else     glide(277, 185, pc.exh * .95, .035);
        if (inh && i === c.breaths - 1 && c.breaths >= 10) say(L("آخر نفس"));
      }
      setPh(inh ? "in" : "out");
      setOrb(inh ? MIN_S + (MAX_S - MIN_S) * ease(p / pc.inh)
                 : MAX_S - (MAX_S - MIN_S) * ease((p - pc.inh) / pc.exh));
      setBig(i + 1); setSmall(inh ? L("شهيق") : L("زفير"));
      setRing(1 - R.pt / (c.breaths * cyc));
      break;
    }
    case "hold": {
      const target = holdFor(c, R.round);
      setPh("hold"); setOrb(MIN_S * (1 + .02 * Math.sin(R.pt * .9)));
      if (target){
        const left = target - R.pt, sec = Math.ceil(left);
        if (sec !== R.beat && sec > 0){ R.beat = sec; if (sec <= 3) tick(); }
        setBig(mmss(Math.max(0, left))); setSmall(L("احبس")); setRing(left / target);
        if (left <= 0){ recordHold(target); enter("recover"); }
      } else {
        /* حبس حر: العدّاد يصعد، والحلقة تمتلئ كل دقيقة، وجرس خفيف كل ٣٠ ثانية */
        const half = Math.floor(R.pt / 30);
        if (half !== R.beat){ if (R.beat >= 0 && half > 0) chime(330, .05, 1.4); R.beat = half; }
        setBig(mmss(R.pt)); setSmall(L("احبس")); setRing((R.pt % 60) / 60);
      }
      break;
    }
    case "recover": {
      const d = c.recover, left = d - R.pt, sec = Math.ceil(left);
      if (sec !== R.beat && sec > 0){ R.beat = sec; if (sec <= 3) tick(); }
      setPh("recover");
      setOrb(R.pt < 2 ? MIN_S + (MAX_S - MIN_S) * ease(R.pt / 2) : MAX_S * (1 + .01 * Math.sin(R.pt)));
      setBig(Math.max(1, sec)); setSmall(R.pt < 2 ? L("شهيق") : L("احبس")); setRing(left / d);
      if (left <= 0) enter("release");
      break;
    }
    case "release": {
      setPh("release");
      setOrb(MAX_S - (MAX_S - .7) * ease(R.pt / RELEASE));
      setBig(R.round < c.rounds ? R.round + 1 : "✓");
      setSmall(R.round < c.rounds ? L("الجولة التالية") : L("انتهت"));
      setRing(1 - R.pt / RELEASE);
      if (R.pt >= RELEASE){
        if (R.round < c.rounds){ R.round++; paintFrame(); enter("breathe"); }
        else finish();
      }
      break;
    }
  }
}

/* الانتقال اليدوي للمرحلة التالية */
function skip(){
  if (!R) return;
  if (R.paused) resume();
  switch (R.phase){
    case "ready":   enter("breathe"); break;
    case "breathe": enter("hold"); break;
    case "hold":    recordHold(R.pt); enter("recover"); break;
    case "recover": enter("release"); break;
    case "release": R.pt = RELEASE; break;
  }
}
function breatheNow(){                             // «تنفّس الآن» أثناء الحبس
  if (!R || R.phase !== "hold") return;
  recordHold(R.pt); enter("recover");
}
function pause(){
  if (!R || R.paused || R.phase === "done") return;
  R.paused = true; hush(); keepAwake(false); paintButtons();
  setSmall(L("متوقف"));
}
function resume(){
  if (!R || !R.paused) return;
  R.paused = false; keepAwake(true); R.last = performance.now(); paintButtons();
}

async function stopAsk(){
  if (!R) return;
  const was = R.paused;
  pause();
  const done = R.holds.filter(Boolean).length;
  const yes = await C.ask(L("إنهاء الجلسة؟"),
    done ? L("نحفظ الجولات اللي خلّصتها ({0}).", done) : L("ما خلّصت أي جولة بعد، فما راح تنحفظ."),
    L("أنهِ الجلسة"));
  if (!R) return;
  if (!yes){ if (!was) resume(); return; }
  if (done) finish();
  else reset();
}

function reset(){
  cancelAnimationFrame(raf); hush(); keepAwake(false);
  R = null;
  renderBreath();
}

async function finish(){
  cancelAnimationFrame(raf); keepAwake(false);
  const holds = R.holds.filter(Boolean);
  const prevBest = stats().best;
  R.phase = "done";
  R.summary = null;
  if (!holds.length){ reset(); return; }
  const sess = { id: uid(), at: Date.now(), breaths: R.cfg.breaths, pace: R.cfg.pace,
                 recover: R.cfg.recover, holds, dur: R.active };
  R.summary = { sess: clean(sess), record: Math.max(...holds) > prevBest && prevBest > 0, first: prevBest === 0 };
  say(L("أحسنت. انتهت الجلسة"));
  chime(523, .07, 1.2); setTimeout(() => chime(784, .06, 1.6), 260);
  vib([30, 80, 30]);
  $("breathBox").innerHTML = doneHTML(R.summary);
  window.scrollTo(0, 0);
  await putSession(sess);
}

/* ============================================================
   الرسم أثناء الجلسة
   ============================================================ */
function setPh(ph){
  if (R.view.ph === ph) return;
  R.view.ph = ph;
  const box = $("brRun"); if (box) box.dataset.ph = ph;
  const meta = PHASE[ph] || {};
  const lb = $("brPhase"); if (lb) lb.textContent = L(meta.label || "");
  const tp = $("brTip");
  if (tp){
    const free = ph === "hold" && R.cfg.holdMode === "free";
    tp.textContent = free ? L("احبس حتى تحس بالحاجة للتنفس، ثم اضغط «تنفّس الآن».") : L(meta.tip || "");
  }
  paintButtons();
}
function setOrb(s){
  const o = $("brOrb"), h = $("brHalo");
  if (o) o.style.transform = `scale(${s.toFixed(4)})`;
  if (h) h.style.transform = `scale(${(s * 1.12).toFixed(4)})`;
}
function setBig(t){
  t = String(t);
  if (R.view.big === t) return;
  R.view.big = t;
  const el = $("brBig"); if (el) el.textContent = t;
}
function setSmall(t){
  if (R.paused && t !== L("متوقف")) t = L("متوقف");
  if (R.view.small === t) return;
  R.view.small = t;
  const el = $("brSmall"); if (el) el.textContent = t;
}
function setRing(frac){
  const el = $("brRingFg"); if (!el) return;
  el.style.strokeDashoffset = (CIRC * (1 - clamp(frac, 0, 1))).toFixed(2);
}
function paintRounds(){
  const box = $("brRounds"); if (!box || !R) return;
  let h = "";
  for (let r = 1; r <= R.cfg.rounds; r++){
    const t = R.holds[r - 1];
    const cls = t ? "done" : (r === R.round ? "on" : "");
    h += `<span class="br-rd ${cls}"><b>${r}</b><small>${t ? mmss(t) : "—"}</small></span>`;
  }
  box.innerHTML = h;
}
function paintButtons(){
  const b = $("brMain"); if (!b || !R) return;
  let icon, label;
  if (R.paused){ icon = "i-play"; label = L("تابع"); }
  else if (R.phase === "hold"){ icon = "i-breath"; label = L("تنفّس الآن"); }
  else { icon = "i-pause"; label = L("إيقاف مؤقت"); }
  b.innerHTML = `<svg class="ic"><use href="#${icon}"/></svg><span>${label}</span>`;
  b.classList.toggle("br-now", !R.paused && R.phase === "hold");
}
function paintFrame(){
  if (!R) return;
  const rd = $("brRound");
  if (rd) rd.textContent = L("الجولة {0} من {1}", R.round, R.cfg.rounds);
  R.view.ph = null;
  paintRounds();
}

function runHTML(){
  return `
  <div class="br-run" id="brRun" data-ph="ready">
    <div class="br-run-top">
      <span class="br-round" id="brRound"></span>
      <span class="br-phase" id="brPhase"></span>
    </div>
    <div class="br-stage" aria-live="off">
      <div class="br-halo" id="brHalo"></div>
      <div class="br-orb" id="brOrb"></div>
      <svg class="br-ring" viewBox="0 0 220 220" aria-hidden="true">
        <circle class="br-ring-bg" cx="110" cy="110" r="104"/>
        <circle class="br-ring-fg" id="brRingFg" cx="110" cy="110" r="104"
                stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="0"/>
      </svg>
      <div class="br-core"><b id="brBig"></b><small id="brSmall"></small></div>
    </div>
    <p class="br-tip" id="brTip"></p>
    <div class="br-rounds" id="brRounds"></div>
    <div class="br-ctrl">
      <button class="btn btn-primary btn-lg" id="brMain" data-act="main"></button>
      <button class="btn btn-soft btn-sq" data-act="skip" aria-label="${esc(L("التالي"))}"><svg class="ic"><use href="#i-next"/></svg></button>
      <button class="btn btn-soft btn-sq" data-act="stop" aria-label="${esc(L("إنهاء"))}"><svg class="ic"><use href="#i-stop"/></svg></button>
    </div>
  </div>`;
}

/* ============================================================
   الرسم: شاشة الإعداد
   ============================================================ */
function stepRow(k, title, sub, val){
  const [a, b] = LIMITS[k];
  return `
  <div class="br-row">
    <span class="br-lab"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>
    <span class="br-step">
      <button type="button" data-step="${k}" data-d="-1" aria-label="${esc(L("أنقص"))}" ${cfg[k] <= a ? "disabled" : ""}>−</button>
      <output>${val}</output>
      <button type="button" data-step="${k}" data-d="1" aria-label="${esc(L("زد"))}" ${cfg[k] >= b ? "disabled" : ""}>+</button>
    </span>
  </div>`;
}
function segRow(k, title, opts){
  return `
  <div class="br-row col">
    <span class="br-lab"><b>${title}</b></span>
    <div class="seg">${opts.map(([v, t]) =>
      `<button type="button" data-seg="${k}" data-v="${v}" class="${cfg[k] === v ? "on" : ""}">${t}</button>`).join("")}</div>
  </div>`;
}
function togRow(k, title, sub){
  return `
  <label class="br-row br-tg">
    <span class="br-lab"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>
    <input type="checkbox" class="br-tog" data-tog="${k}" ${cfg[k] ? "checked" : ""}>
  </label>`;
}

function estText(){
  return cfg.holdMode === "free"
    ? L("حوالي {0} دقيقة — حسب مدة حبسك", estMinutes(cfg))
    : L("حوالي {0} دقيقة", estMinutes(cfg));
}

function setupHTML(){
  const st = stats();
  const pk = presetOf(cfg);
  const fixed = cfg.holdMode === "fixed";
  const holdSub = fixed && cfg.holdInc
    ? L("الجولة الأخيرة {0}", mmss(holdFor(cfg, cfg.rounds))) : "";
  return `
  <div class="br-hero">
    <div class="br-hero-orb" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="br-hero-tx">
      <span class="br-eyebrow">${L("طريقة ويم هوف")}</span>
      <h2>${L("التنفس العميق")}</h2>
      <p>${L("أنفاس بطنية عميقة، ثم حبس النفس، ثم نفَس استشفاء — جولة بعد جولة.")}</p>
    </div>
    <div class="br-hero-stats">
      <div><b>${st.best ? mmss(st.best) : "—"}</b><small>${L("أفضل حبس")}</small></div>
      <div><b>${st.count}</b><small>${L("الجلسات")}</small></div>
      <div><b>${st.week}</b><small>${L("هذا الأسبوع")}</small></div>
    </div>
    <button class="btn br-go" data-act="start"><svg class="ic"><use href="#i-play"/></svg><span>${L("ابدأ الجلسة")}</span></button>
    <p class="br-est">${esc(estText())}</p>
  </div>

  <div class="br-sec">
    <div class="head-row"><h2>${L("خصّص جلستك")}</h2>
      <span class="count">${pk === "custom" ? L("مخصّصة") : L(PRESETS.find(p => p.k === pk).name)}</span></div>
    <div class="chips br-presets">${PRESETS.map(p =>
      `<button type="button" class="chip ${pk === p.k ? "on" : ""}" data-preset="${p.k}">${L(p.name)}</button>`).join("")}</div>
    <div class="card br-cfg">
      ${stepRow("rounds",  L("عدد الجولات"), "", cfg.rounds)}
      ${stepRow("breaths", L("الأنفاس في كل جولة"), L("ويم هوف يوصي بـ 30 إلى 40"), cfg.breaths)}
      ${segRow("pace", L("سرعة التنفس"), [["calm", L("هادئ")], ["mid", L("متوسط")], ["fast", L("سريع")]])}
      ${segRow("holdMode", L("حبس النفس"), [["free", L("حتى أحتاج")], ["fixed", L("وقت محدد")]])}
      ${fixed ? stepRow("hold", L("مدة الحبس"), holdSub, mmss(cfg.hold)) : ""}
      ${fixed ? togRow("holdInc", L("زد 15 ثانية كل جولة"), "") : ""}
      ${stepRow("recover", L("نفَس الاستشفاء"), L("شهيق كامل وحبس بعد كل جولة"), L("{0} ث", cfg.recover))}
    </div>
    <div class="card br-cfg">
      ${togRow("voice", L("صوت يرشدك"), L("يعلن الجولة وبداية كل مرحلة"))}
      ${togRow("tone",  L("نغمة النفَس"), L("تصعد مع الشهيق وتهبط مع الزفير"))}
      ${togRow("vibe",  L("اهتزاز"), L("عند تغيّر المرحلة — على الأجهزة التي تدعمه"))}
    </div>
  </div>

  <details class="card br-how" ${howOpen ? "open" : ""}>
    <summary><span>${L("كيف تعمل الجلسة؟")}</span><i class="drop-ar"></i></summary>
    <ol>
      <li><b>${L("الأنفاس")}</b><span>${L("تنفّس بعمق من البطن ثم الصدر، وأطلق بدون جهد. تابع الكرة: تكبر مع الشهيق وتصغر مع الزفير.")}</span></li>
      <li><b>${L("حبس النفس")}</b><span>${L("بعد آخر زفير احبس نفسك مع رئتين مرتخيتين، حتى تحس بالحاجة للتنفس.")}</span></li>
      <li><b>${L("نفَس الاستشفاء")}</b><span>${L("شهيق كامل واحبسه لحظات، ثم أطلقه وابدأ الجولة التالية.")}</span></li>
    </ol>
  </details>

  <div class="br-safe">
    <span class="br-safe-ic" aria-hidden="true">!</span>
    <p>${L("مارسها جالساً أو مستلقياً. لا تمارسها أبداً في الماء أو أثناء القيادة أو وأنت واقف. الدوخة والتنميل الخفيف طبيعيان، وإذا حسيت بإغماء توقّف وتنفّس طبيعياً. إذا عندك حمل أو صرع أو مشكلة في القلب أو الضغط فاستشر طبيبك أولاً.")}</p>
  </div>

  ${historyHTML()}`;
}

function fmtDate(t){
  const d = new Date(t);
  return d.toLocaleDateString(LOC(), { weekday:"short", day:"numeric", month:"short" }) +
         " · " + d.toLocaleTimeString(LOC(), { hour:"numeric", minute:"2-digit" });
}

function colsHTML(vals, max, labels){
  return vals.map((v, i) => {
    const h = max ? Math.max(6, Math.round(v / max * 100)) : 6;
    return `<span class="br-col"><b>${mmss(v)}</b><i style="--h:${h}%"></i><small>${labels[i]}</small></span>`;
  }).join("");
}

function historyHTML(){
  const list = C.S.breaths || [];
  if (!list.length){
    return `<div class="br-sec">
      <div class="head-row"><h2>${L("جلساتك")}</h2></div>
      <p class="empty">${L("ما في جلسات بعد. أول جلسة تسجّل أطول حبس لك.")}</p>
    </div>`;
  }
  const max = Math.max(1, ...list.map(bestOf));

  /* تطوّر أفضل حبس عبر آخر ١٢ جلسة — من الأقدم للأحدث */
  const trend = list.slice(0, 12).reverse();
  const trendHTML = trend.length >= 2 ? `
    <div class="card br-trend">
      <div class="head-row"><h3>${L("تطوّر حبس النفس")}</h3><span class="count">${L("آخر {0} جلسات", trend.length)}</span></div>
      <div class="br-spark">${trend.map(b => {
        const v = bestOf(b), h = Math.max(6, Math.round(v / max * 100));
        return `<i class="${v === max ? "top" : ""}" style="--h:${h}%" title="${mmss(v)}"></i>`;
      }).join("")}</div>
    </div>` : "";

  const items = list.slice(0, shown).map(b => {
    const best = bestOf(b);
    return `
    <li class="br-item" data-id="${esc(b.id)}">
      <span class="br-item-h"><b>${esc(fmtDate(b.at))}</b>
        <small>${L("{0} جولات · {1} نفَس · {2}", b.holds.length, b.breaths, mmss(b.dur))}</small></span>
      <span class="br-item-best"><b>${mmss(best)}</b><small>${L("أفضل حبس")}</small></span>
      <span class="br-mini">${b.holds.map(v =>
        `<i class="${v === best ? "top" : ""}" style="--h:${Math.max(10, Math.round(v / max * 100))}%" title="${mmss(v)}"></i>`).join("")}</span>
      <button class="br-del" data-del="${esc(b.id)}" aria-label="${esc(L("احذف الجلسة"))}"><svg class="ic"><use href="#i-trash"/></svg></button>
    </li>`;
  }).join("");

  return `<div class="br-sec">
    <div class="head-row"><h2>${L("جلساتك")}</h2><span class="count">${list.length}</span></div>
    ${trendHTML}
    <ul class="br-list">${items}</ul>
    ${list.length > shown ? `<button class="btn btn-soft" data-act="more">${L("عرض المزيد")}</button>` : ""}
  </div>`;
}

function doneHTML(sm){
  const s = sm.sess, best = bestOf(s);
  const avg = Math.round(s.holds.reduce((a, b) => a + b, 0) / s.holds.length);
  const head = sm.record ? L("رقم جديد! أطول حبس لك 🎉")
             : sm.first ? L("أول جلسة — هذا رقمك اللي تتحداه") : L("أحسنت — انتهت الجلسة");
  return `
  <div class="card br-done">
    <span class="br-done-orb" aria-hidden="true"></span>
    <h2>${head}</h2>
    <p class="br-done-sub">${L("{0} جولات · {1}", s.holds.length, mmss(s.dur))}</p>
    <div class="br-cols">${colsHTML(s.holds, best, s.holds.map((_, i) => String(i + 1)))}</div>
    <div class="br-done-stats">
      <div><b>${mmss(best)}</b><small>${L("أفضل حبس")}</small></div>
      <div><b>${mmss(avg)}</b><small>${L("المتوسط")}</small></div>
    </div>
    <button class="btn btn-primary btn-lg" data-act="again"><svg class="ic"><use href="#i-play"/></svg><span>${L("جلسة جديدة")}</span></button>
    <button class="btn btn-soft" data-act="back">${L("رجوع")}</button>
  </div>`;
}

/* ============================================================
   الواجهة العامة
   ============================================================ */
export function renderBreath(){
  const box = $("breathBox"); if (!box) return;
  if (R && R.phase === "done" && R.summary){ box.innerHTML = doneHTML(R.summary); return; }
  if (R){
    if (!$("brRun")){
      box.innerHTML = runHTML();
      R.view = {};
      paintFrame();
      step();
    }
    paintButtons();
    return;
  }
  box.innerHTML = setupHTML();
}

/* يُستدعى من show(): يلوّن الصفحة بلوحة التنفس ويوقف الجلسة مؤقتاً عند المغادرة */
export function breathShown(on){
  const b = document.body;
  if (on) b.dataset.zone = "breath"; else delete b.dataset.zone;
  paintMeta();
  if (!on && R){
    if (R.phase === "done") R = null;
    else pause();
  }
}
/* عند تسجيل الخروج: تُلغى أي جلسة جارية وترجع ألوان الجبل */
export function breathTeardown(){
  cancelAnimationFrame(raf); hush(); keepAwake(false);
  R = null; shown = SHOW;
  delete document.body.dataset.zone;
}
const MOUNTAIN_META = { light:"#FFF6EF", dark:"#150E15" };      // نفس قيم applyTheme في app.js
export function paintMeta(){
  const m = document.querySelector('meta[name="theme-color"]');
  if (!m) return;
  const pal = document.body.dataset.zone === "breath" ? BREATH_META : MOUNTAIN_META;
  m.content = document.documentElement.dataset.theme === "dark" ? pal.dark : pal.light;
}

async function onStart(){
  audio();
  if (!lsGet(OK_LK, false)){
    const yes = $("cfYes");
    yes.classList.replace("btn-danger", "btn-primary");
    const ok = await C.ask(L("قبل ما تبدأ"),
      L("مارسها جالساً أو مستلقياً، وأبداً لا تمارسها في الماء أو أثناء القيادة. الدوخة الخفيفة طبيعية — إذا حسيت بإغماء توقّف وتنفّس طبيعياً."),
      L("فهمت، ابدأ"));
    yes.classList.replace("btn-primary", "btn-danger");
    if (!ok) return;
    lsSet(OK_LK, true);
  }
  start();
}

function change(fn){ fn(); cfg = cleanCfg(cfg); saveCfg(); renderBreath(); }

export function initBreath(ctx){
  C = ctx;
  const box = $("breathBox"); if (!box) return;

  box.addEventListener("click", async e => {
    const t = e.target.closest("button");
    if (!t || !box.contains(t)) return;
    const act = t.dataset.act;

    if (act === "start") return onStart();
    if (act === "main"){
      if (!R) return;
      if (R.paused) resume();
      else if (R.phase === "hold") breatheNow();
      else pause();
      return;
    }
    if (act === "skip") return skip();
    if (act === "stop") return stopAsk();
    if (act === "again"){ R = null; return start(); }
    if (act === "back"){ R = null; renderBreath(); window.scrollTo(0, 0); return; }
    if (act === "more"){ shown += SHOW; renderBreath(); return; }

    if (t.dataset.step){
      const k = t.dataset.step, st = LIMITS[k][2];
      return change(() => { cfg[k] = cfg[k] + st * (+t.dataset.d); });
    }
    if (t.dataset.seg){
      return change(() => { cfg[t.dataset.seg] = t.dataset.v; });
    }
    if (t.dataset.preset){
      const p = PRESETS.find(x => x.k === t.dataset.preset);
      if (p) return change(() => { Object.assign(cfg, p.cfg); });
    }
    if (t.dataset.del){
      const id = t.dataset.del;
      const b = (C.S.breaths || []).find(x => x.id === id);
      if (!b) return;
      const ok = await C.ask(L("حذف الجلسة"), L("جلسة {0} — ما تقدر ترجعها.", fmtDate(b.at)));
      if (!ok) return;
      await dropSession(id);
      renderBreath();
    }
  });

  box.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset && t.dataset.tog){
      cfg[t.dataset.tog] = t.checked;
      cfg = cleanCfg(cfg); saveCfg();
      if (t.dataset.tog === "holdInc") renderBreath();
    }
  });

  box.addEventListener("toggle", e => {
    if (e.target.classList && e.target.classList.contains("br-how")) howOpen = e.target.open;
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && R && !R.paused && R.phase !== "done") keepAwake(true);
  });
}
