/* ============================================================
   نادي الجبال — التنفس العميق (طريقة ويم هوف)
   ▸ الجولة: أنفاس عميقة ← نفَس أخير عميق ← حبس النفس بعد الزفير
     ← شهيق عميق ونحبس النفس (الاستشفاء) ← الجولة التالية
   ▸ «الأساسي» يطابق فيديو ويم هوف للمبتدئين: ٣ جولات × ٣٠ نفَساً بطيئاً،
     حبس ٣٠ ثم ٦٠ ثم ٩٠ ثانية، واستشفاء ١٥ ثانية — حوالي ١١ دقيقة
   ▸ شاشة الجلسة: خلفية مشكال زرقاء متحركة، سداسي برتقالي متعدد الطبقات
     يكبر مع الشهيق ويصغر لنقطة مع الزفير، ومروحة زرقاء تعدّ وقت الحبس
   ▸ الجلسات خاصة: users/{uid}/breaths — نفس قاعدة بيانات المستخدم
   ============================================================ */

import { L, LOC, SPEECH, lang } from "./i18n.js";

let C = null;

export const BREATH_LK = "hejaz.breaths";           // سجل الجلسات — يُمسح مع بيانات المستخدم
const CFG_LK = "hejaz.breath.cfg";                  // إعداد الجلسة — تفضيل جهاز
const OK_LK  = "hejaz.breath.ok";                   // قرأ تنبيه السلامة
export const BREATH_META = { light:"#EAF2FC", dark:"#061229" };
const LIVE_META = "#0E3E9E";                        // لون شريط الحالة أثناء الجلسة

const KEEP = 200;                                   // أقصى عدد جلسات محفوظة
const SHOW = 8;                                     // جلسات تظهر قبل «عرض المزيد»

/* توقيت المراحل بالثواني — مأخوذ من الفيديو */
const READY  = 20;                                  // تمهيد: الرئتين ثم وضعية الجلوس أو الاستلقاء
const READY_LUNGS = 7;
const LAST   = { inh:3, top:.8, out:2.2 };          // النفَس الأخير الطويل قبل الحبس
const REC_IN = 3;                                   // «شهيق عميق» قبل «نحبس النفس»
const SHRINK = 1.5;                                 // إطلاق النفس بعد الاستشفاء
const CARD   = 3;                                   // بطاقة «الجولة ٢»
const REST   = 45;                                  // ختام: تنفّس طبيعياً

const PACES = {
  slow: { inh:2.0, exh:1.67 },                      // إيقاع الفيديو: نفَس كل ٣٫٦٧ ثانية
  mid:  { inh:1.7, exh:1.3 },
  fast: { inh:1.3, exh:0.9 }
};
const LIMITS = { rounds:[1,8,1], breaths:[15,60,5], hold:[30,300,15], recover:[10,30,5] };
const STEPS  = [0, 15, 30];                         // زيادة الحبس المحدد كل جولة
const PRESETS = [
  { k:"basic",   name:"الأساسي",   cfg:{ rounds:3, breaths:30, pace:"slow", holdMode:"fixed", hold:30,  holdStep:30, recover:15 } },
  { k:"easy",    name:"مبتدئ",     cfg:{ rounds:2, breaths:25, pace:"slow", holdMode:"free",  hold:60,  holdStep:0,  recover:15 } },
  { k:"classic", name:"الكلاسيكي", cfg:{ rounds:3, breaths:30, pace:"mid",  holdMode:"free",  hold:90,  holdStep:0,  recover:15 } },
  { k:"deep",    name:"متقدّم",    cfg:{ rounds:4, breaths:40, pace:"fast", holdMode:"free",  hold:120, holdStep:0,  recover:20 } }
];
const DEF = { ...PRESETS[0].cfg, voice:true, tone:true, vibe:true };

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s/60) + ":" + String(s%60).padStart(2, "0"); };
const ease = t => (1 - Math.cos(Math.PI * clamp(t, 0, 1))) / 2;
const f1 = n => (Math.round(n * 10) / 10).toString();
const oldPace = p => p === "calm" ? "slow" : p;     // «هادئ» القديم صار «بطيء»
function lsGet(k, fb){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e){ return fb; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

/* ============================================================
   الإعداد
   ============================================================ */
function cleanCfg(c){
  c = { ...DEF, ...(c || {}) };
  const n = (k, v) => { const [a, b, st] = LIMITS[k]; v = Math.round((+v || a) / st) * st; return clamp(v, a, b); };
  let step = +c.holdStep;
  if (!STEPS.includes(step)) step = c.holdInc ? 15 : 0;          // إعداد قديم: زيادة ١٥
  const pace = oldPace(c.pace);
  return {
    rounds:   n("rounds", c.rounds),
    breaths:  n("breaths", c.breaths),
    pace:     PACES[pace] ? pace : "slow",
    holdMode: c.holdMode === "fixed" ? "fixed" : "free",
    hold:     n("hold", c.hold),
    holdStep: step,
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
    (c.holdMode === "free" || (x.hold === c.hold && x.holdStep === c.holdStep)));
  return p ? p.k : "custom";
}

const holdFor = (c, round) => c.holdMode === "fixed" ? c.hold + c.holdStep * (round - 1) : 0;
const lastTime = () => LAST.inh + LAST.top + LAST.out;

function estSeconds(c){
  const pc = PACES[c.pace], cyc = pc.inh + pc.exh;
  let s = READY + REST;
  for (let r = 1; r <= c.rounds; r++){
    s += (c.breaths - 1) * cyc + lastTime()
       + (c.holdMode === "fixed" ? holdFor(c, r) : 75)
       + REC_IN + c.recover + SHRINK + (r < c.rounds ? CARD : 0);
  }
  return s;
}
const estMinutes = c => Math.max(1, Math.round(estSeconds(c) / 60));

/* ============================================================
   التخزين — محلي دائماً، وسحابي عند تسجيل الدخول
   ============================================================ */
function clean(b){
  const holds = Array.isArray(b.holds) ? b.holds.map(x => clamp(Math.round(+x || 0), 0, 1800)).slice(0, 8) : [];
  const pace = oldPace(b.pace);
  return {
    id: String(b.id),
    at: +b.at || Date.now(),
    breaths: clamp(Math.round(+b.breaths || 30), 1, 100),
    pace: PACES[pace] ? pace : "slow",
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
function glide(fa, fb, dur, vol){
  if (!R || !R.cfg.tone) return;
  const a = audio(); if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(fa, t);
    o.frequency.exponentialRampToValueAtTime(fb, t + dur);
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
   خلفية المشكال — بقع فيروزية وزرقاء تتحرك ببطء وتنعكس ١٢ مرة
   ============================================================ */
const KAL_SRC = 200;
/* مشكال مائي: بقع فيروزية متداخلة تغطي نصف الأزرق تقريباً، وخلايا كحلية بينها،
   تنعكس ١٢ مرة وتتكرر في حلقات حول المركز — مثل خلفية الفيديو */
const KAL_BASE = "#2378DE";
const KAL_LIGHT = ["rgba(96,226,255,", "rgba(150,240,255,", "rgba(62,200,250,", "rgba(185,248,255,"];
const KAL_DARK  = ["rgba(10,48,160,", "rgba(16,70,190,"];
function rnd(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function makeKaleido(cv, seed = 7){
  const src = document.createElement("canvas");
  src.width = src.height = KAL_SRC;
  const sx = src.getContext("2d"), cx = cv.getContext("2d");
  const r = rnd(seed);
  const mk = (n, cols, r0, r1, a) => Array.from({ length:n }, (_, i) => ({
    x: r(), y: r(), rad: r0 + r() * (r1 - r0), c: cols[i % cols.length], a,
    ph: r() * 6.28, sp: .05 + r() * .12, ax: .04 + r() * .12, ay: .04 + r() * .12
  }));
  const dark = mk(14, KAL_DARK, .06, .13, .75);
  const light = mk(40, KAL_LIGHT, .07, .17, .85);
  const spark = mk(9, ["rgba(225,252,255,"], .02, .045, .7);
  let w = 0, h = 0;

  function fit(){
    const bw = cv.clientWidth || 360, bh = cv.clientHeight || 640;
    const k = Math.min(1, 560 / Math.max(bw, bh));          // دقة منخفضة: الخلفية ناعمة أصلاً
    const nw = Math.max(2, Math.round(bw * k)), nh = Math.max(2, Math.round(bh * k));
    if (nw !== w || nh !== h){ w = cv.width = nw; h = cv.height = nh; }
  }
  function paint(list, t){
    for (const b of list){
      /* البقعة تلتف حول حدود المصدر حتى لا تنقطع الحلقات */
      const x = ((b.x + Math.sin(t * b.sp + b.ph) * b.ax) % 1 + 1) % 1 * KAL_SRC;
      const y = ((b.y + Math.cos(t * b.sp * .8 + b.ph) * b.ay) % 1 + 1) % 1 * KAL_SRC;
      const rr = b.rad * KAL_SRC;
      const g = sx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, b.c + b.a + ")"); g.addColorStop(.5, b.c + (b.a * .6).toFixed(2) + ")"); g.addColorStop(1, b.c + "0)");
      sx.fillStyle = g; sx.beginPath(); sx.arc(x, y, rr, 0, 6.2832); sx.fill();
    }
  }
  function draw(t){
    fit();
    sx.fillStyle = KAL_BASE;
    sx.fillRect(0, 0, KAL_SRC, KAL_SRC);
    paint(dark, t); paint(light, t); paint(spark, t);
    /* ١٢ قطعة: كل قطعة صورة مرآة لجارتها، والمصدر يتكرر ٣ مرات على طول نصف القطر */
    const N = 12, A = 2 * Math.PI / N, Rr = Math.hypot(w, h) / 2 + 2, T = Rr * .4;
    cx.save();
    cx.fillStyle = KAL_BASE; cx.fillRect(0, 0, w, h);
    cx.translate(w / 2, h / 2);
    cx.rotate(t * .02);
    for (let k = 0; k < N; k++){
      cx.save();
      if (k % 2){ cx.rotate((k + 1) * A); cx.scale(1, -1); } else cx.rotate(k * A);
      cx.beginPath(); cx.moveTo(0, 0); cx.arc(0, 0, Rr, -.004, A + .004); cx.closePath(); cx.clip();
      for (let j = 0; j < 3; j++) cx.drawImage(src, j * T * .92, 0, T, T);
      cx.restore();
    }
    cx.restore();
  }
  return { draw };
}

/* ============================================================
   الأشكال: السداسي البرتقالي والمروحة الزرقاء
   ============================================================ */
/* سداسي رأسه للأعلى بزوايا مستديرة؛ cut = نسبة القطع من كل ضلع (٠٫٥ ≈ دائرة) */
function rhex(Rr, cut, rotDeg){
  const pts = [];
  for (let i = 0; i < 6; i++){
    const a = (rotDeg - 90 + 60 * i) * Math.PI / 180;
    pts.push([Rr * Math.cos(a), Rr * Math.sin(a)]);
  }
  let p = "";
  for (let i = 0; i < 6; i++){
    const [x, y] = pts[i], [px, py] = pts[(i + 5) % 6], [nx, ny] = pts[(i + 1) % 6];
    p += (i ? "L" : "M") + f1(x + (px - x) * cut) + " " + f1(y + (py - y) * cut)
       + "Q" + f1(x) + " " + f1(y) + " " + f1(x + (nx - x) * cut) + " " + f1(y + (ny - y) * cut);
  }
  return p + "Z";
}
/* الطبقات من الخارج للداخل: اللون، حجمها والشكل نقطة، حجمها والشكل كامل، اتجاه دورانها */
const HEX_LAYERS = [
  ["#E3751D", 1,   1,    1  ],
  ["#F39A33", .84, .972, -.6],
  ["#FAC76C", .72, .952, .45],
  ["url(#brCream)", .58, .935, -.2]
];
const HEX_MIN = 13, HEX_MAX = 108;

/* s: الحجم من ٠ (نقطة) إلى ١ (كامل) — dir: اتجاه الحركة لتفريق الطبقات أثناءها */
function hexPaths(s, dir = 1){
  s = clamp(s, 0, 1);
  const R0 = lerp(HEX_MIN, HEX_MAX, s);
  const cut = lerp(.5, .07, Math.pow(s, .8));
  const twist = 17 * Math.sin(Math.PI * s) * dir;
  return HEX_LAYERS.map(([, a, b, k]) => rhex(R0 * lerp(a, b, s), cut, twist * k));
}
function hexSVG(s, dir, num, cls = ""){
  const d = hexPaths(s, dir);
  return `<svg class="${cls}" viewBox="-120 -120 240 240" aria-hidden="true">
    <defs><linearGradient id="brCream${cls ? "-" + cls : ""}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF9E3"/><stop offset="1" stop-color="#FFE7A8"/></linearGradient></defs>
    ${HEX_LAYERS.map(([c], i) => `<path d="${d[i]}" fill="${c.replace("brCream", "brCream" + (cls ? "-" + cls : ""))}"/>`).join("")}
    ${num != null ? `<text class="br-hnum" x="0" y="2" font-size="${f1(14 + 58 * s)}">${num}</text>` : ""}
  </svg>`;
}

/* قطاع دائري يبدأ من الساعة ١٢ ويتّسع عكس عقارب الساعة */
function sector(Rr, deg){
  if (deg <= .2) return "";
  if (deg >= 359.8) return `M0 ${-Rr}A${Rr} ${Rr} 0 1 0 0 ${Rr}A${Rr} ${Rr} 0 1 0 0 ${-Rr}Z`;
  const a = (-90 - deg) * Math.PI / 180;
  return `M0 0L0 ${-Rr}A${Rr} ${Rr} 0 ${deg > 180 ? 1 : 0} 0 ${f1(Rr * Math.cos(a))} ${f1(Rr * Math.sin(a))}Z`;
}
/* طبقات المروحة من الخارج للداخل: نصف القطر، اللون، تأخّر الحافة بالدرجات */
const FAN_LAYERS = [[96, "rgba(214,220,255,.93)", 0], [80, "rgba(178,188,255,.95)", 3],
                    [63, "#8F9CFA", 6], [46, "#5567F0", 9]];

/* ============================================================
   الأيقونات — رسومات بسيطة مرسومة لهذا التطبيق
   ============================================================ */
const ICON = {
  lungs: `<svg viewBox="-40 -38 80 76" aria-hidden="true">
    <path d="M-3.2-34h6.4v19.5l10.5 8.3-3.4 4.3L0-9.6-10.3-1.9l-3.4-4.3L-3.2-14.5Z"/>
    <path d="M-8.5-14.5C-21-22-36-6-36 13.5-36 30-25 35.5-12.5 31-6 28.6-5 22.6-5 15.5V-4.5Z"/>
    <path d="M8.5-14.5C21-22 36-6 36 13.5 36 30 25 35.5 12.5 31 6 28.6 5 22.6 5 15.5V-4.5Z"/></svg>`,
  sit: `<svg viewBox="-40 -38 80 72" aria-hidden="true">
    <circle cx="0" cy="-26" r="7.8"/>
    <path d="M-10.5-14.5Q0-18.5 10.5-14.5L13.5 5Q21 3 26.5 10.5 22 15 13 13.5H-13Q-22 15-26.5 10.5-21 3-13.5 5Z"/>
    <path d="M-33 19Q-16 9 0 14.5 16 9 33 19 31 28 15 27L0 22.5-15 27Q-31 28-33 19Z"/></svg>`,
  lie: `<svg viewBox="-52 -16 104 32" aria-hidden="true">
    <circle cx="-40" cy="-2.5" r="6.5"/>
    <path d="M-31-7Q-20-10.5-5-8.5L22-7.5Q35-7.5 44-4 48.5-1.5 46 2 35 3.5 22 3.2L-5 4.2Q-20 6.5-31 3.3Z"/></svg>`
};

/* ============================================================
   المحرّك
   ============================================================
   المراحل: ready ← breathe ← last ← hold ← recover ← release ← (breathe | rest) ← done
   الزمن يُحسب من ساعة الجهاز، فلا ينحرف لو تأخّر الرسم. */
let R = null;          // الجلسة الجارية
let raf = 0;
let kal = null;        // خلفية المشكال للجلسة
let kalLast = 0;
let shown = SHOW;      // عدد الجلسات الظاهرة في السجل
let howOpen = false;   // حالة «كيف تعمل»
const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e){ return false; } };

const PHASE = {
  ready:   { label:"استعد",          tip:"اجلس أو استلقِ براحة، وأرخِ كتفيك." },
  in:      { label:"شهيق",           tip:"شهيق عميق — املأ البطن أولاً ثم الصدر." },
  out:     { label:"زفير",           tip:"أطلق الهواء بلا جهد، ولا تفرّغ رئتيك بالقوة." },
  last:    { label:"شهيق عميق",      tip:"آخر نفَس: املأ رئتيك بالكامل…" },
  lastout: { label:"أطلق",           tip:"…ثم أطلقه كله واستعد لحبس النفس." },
  hold:    { label:"احبس",           tip:"بعد الزفير احبس نفسك. استرخِ وراقب جسمك." },
  recin:   { label:"شهيق عميق",      tip:"شهيق كامل — املأ رئتيك." },
  rechold: { label:"نحبس النفس",     tip:"احبس النفس واشعر بالأكسجين يملأ جسمك." },
  release: { label:"أطلق",           tip:"أطلق النفس ببطء واسترخِ." },
  round:   { label:"الجولة التالية", tip:"استعد للجولة التالية." },
  rest:    { label:"استرخِ",         tip:"تنفّس طبيعياً واسترخِ، ولاحظ إحساس جسمك." }
};

function start(){
  audio();                                        // يفتح الصوت داخل ضغطة المستخدم (iOS)
  R = {
    cfg: { ...cfg },
    round: 1, phase: "", pt: 0, beat: -1, last: performance.now(),
    paused: false, holds: [], active: 0, view: {}
  };
  keepAwake(true);
  mountRun();
  enter("ready");
  loop();
}

function loop(){
  cancelAnimationFrame(raf);
  const f = now => {
    if (!R || R.phase === "done") return;
    const dt = Math.min(.5, Math.max(0, (now - R.last) / 1000));   // رجوع من الخلفية لا يقفز مراحل
    R.last = now;
    if (!R.paused){ R.pt += dt; R.active += dt; }
    step();
    /* الخلفية ٣٠ إطاراً في الثانية — ونادراً جداً مع «تقليل الحركة» */
    const gap = reduceMotion() ? 2000 : 33;
    if (kal && now - kalLast >= gap){ kalLast = now; kal.draw(now / 1000); }
    raf = requestAnimationFrame(f);
  };
  R.last = performance.now();
  raf = requestAnimationFrame(f);
}

function enter(ph){
  R.phase = ph; R.pt = 0; R.beat = -1; R.sub = "";
  const c = R.cfg;
  if (ph === "ready")  say(L("اجلس أو استلقِ براحة. نبدأ بعد قليل"));
  if (ph === "breathe"){ say(L("الجولة {0}. تنفّس بعمق", R.round)); vib(30); }
  if (ph === "last")   say(L("شهيق عميق"));
  if (ph === "hold"){
    chime(392, .09, 1.6); vib([40, 60, 40]);
    say(c.holdMode === "fixed" ? L("احبس النفس {0} ثانية", holdFor(c, R.round)) : L("احبس النفس"));
  }
  if (ph === "recover"){ chime(523, .08, 1.2); vib(40); say(L("شهيق عميق")); }
  if (ph === "release") chime(659, .06, 1);
  if (ph === "rest"){ say(L("تنفّس طبيعياً واسترخِ")); }
  paintFrame();
}

function recordHold(sec){
  R.holds[R.round - 1] = Math.max(1, Math.round(sec));
  paintRounds();
}

/* ثلاثة أوضاع للمسرح: سداسي، مروحة، أو بطاقة */
function step(){
  const c = R.cfg, pc = PACES[c.pace];
  switch (R.phase){
    case "ready": {
      const left = READY - R.pt, sec = Math.ceil(left);
      if (sec !== R.beat && sec > 0){ R.beat = sec; if (sec <= 3) tick(); }
      setPh("ready");
      setMode("card"); setCard(R.pt < READY_LUNGS ? "lungs" : "posture");
      setTop(L("نبدأ بعد {0}", Math.max(1, sec)));
      if (left <= 0) enter("breathe");
      break;
    }
    case "breathe": {
      const cyc = pc.inh + pc.exh, n = Math.max(0, c.breaths - 1);
      const i = Math.floor(R.pt / cyc), p = R.pt - i * cyc;
      if (i >= n){ enter("last"); break; }
      const inh = p < pc.inh;
      const half = i * 2 + (inh ? 0 : 1);
      if (half !== R.beat){
        R.beat = half;
        if (inh) glide(196, 294, pc.inh * .95, .05);
        else     glide(277, 185, pc.exh * .95, .035);
      }
      setPh(inh ? "in" : "out"); setMode("hex"); setCard("");
      setHex(inh ? ease(p / pc.inh) : 1 - ease((p - pc.inh) / pc.exh), inh ? 1 : -1, i + 1, "");
      setTop("");
      break;
    }
    case "last": {
      const t = R.pt, { inh, top, out } = LAST;
      if (R.beat < 0){ R.beat = 0; glide(196, 330, inh * .95, .055); }
      if (t >= inh + top && R.beat < 1){ R.beat = 1; glide(300, 175, out * .9, .04); say(L("أطلق")); }
      const s = t < inh ? ease(t / inh) : t < inh + top ? 1 : 1 - ease((t - inh - top) / out);
      setPh(t < inh + top ? "last" : "lastout"); setMode("hex"); setCard("");
      setHex(s, t < inh + top ? 1 : -1, c.breaths, t < inh + top ? L("شهيق عميق") : "");
      if (t >= lastTime()) enter("hold");
      break;
    }
    case "hold": {
      const target = holdFor(c, R.round);
      setPh("hold"); setMode("fan"); setCard("");
      if (target){
        const left = target - R.pt, sec = Math.ceil(left);
        if (sec !== R.beat && sec > 0){ R.beat = sec; if (sec <= 3) tick(); }
        setFan(R.pt / target, mmss(Math.max(0, left)));
        if (left <= 0){ recordHold(target); enter("recover"); }
      } else {
        /* حبس حر: العدّاد يصعد، والمروحة تكتمل كل دقيقة، وجرس خفيف كل ٣٠ ثانية */
        const half = Math.floor(R.pt / 30);
        if (half !== R.beat){ if (R.beat >= 0 && half > 0) chime(330, .05, 1.4); R.beat = half; }
        setFan((R.pt % 60) / 60, mmss(R.pt));
      }
      break;
    }
    case "recover": {
      const t = R.pt;
      setMode("hex"); setCard("");
      if (t < REC_IN){
        setPh("recin");
        setHex(ease(t / REC_IN), 1, null, L("شهيق عميق"));
      } else {
        const left = c.recover - (t - REC_IN), sec = Math.ceil(left);
        if (R.beat < 0){ R.beat = 0; say(L("نحبس النفس")); }
        if (sec !== R.sub && sec > 0){ R.sub = sec; if (sec <= 3) tick(); }
        setPh("rechold");
        setHex(1, 1, Math.max(1, sec), L("نحبس النفس"), true);
        if (left <= 0) enter("release");
      }
      break;
    }
    case "release": {
      const more = R.round < c.rounds, t = R.pt;
      if (t < SHRINK){
        setPh("release"); setMode("hex"); setCard("");
        setHex(1 - ease(t / SHRINK), -1, null, "");
      } else if (more){
        if (R.beat < 0){ R.beat = 0; chime(587, .05, .9); }
        setPh("round"); setMode("card"); setCard("round", R.round + 1);
      }
      if (t >= SHRINK + (more ? CARD : 0)){
        if (more){ R.round++; enter("breathe"); }
        else enter("rest");
      }
      break;
    }
    case "rest": {
      const left = REST - R.pt;
      setPh("rest"); setMode("card"); setCard("lungs");
      setTop(L("نهاية الجلسة بعد {0}", mmss(Math.max(0, left))));
      if (left <= 0) finish();
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
    case "breathe": enter("last"); break;
    case "last":    enter("hold"); break;
    case "hold":    recordHold(R.pt); enter("recover"); break;
    case "recover": enter("release"); break;
    case "release": R.pt = 99; break;
    case "rest":    finish(); break;
  }
}
function breatheNow(){                             // «تنفّس الآن» أثناء الحبس
  if (!R || R.phase !== "hold") return;
  recordHold(R.pt); enter("recover");
}
function pause(){
  if (!R || R.paused || R.phase === "done") return;
  R.paused = true; hush(); keepAwake(false);
  R.view.ph = null; paintButtons(); setPh(R.view.lastPh || "ready");
}
function resume(){
  if (!R || !R.paused) return;
  R.paused = false; keepAwake(true); R.last = performance.now();
  R.view.ph = null; paintButtons();
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

function unmountRun(){
  kal = null;
  document.documentElement.classList.remove("br-lock");
  document.body.classList.remove("br-live");
  paintMeta();
}

function reset(){
  cancelAnimationFrame(raf); hush(); keepAwake(false);
  R = null;
  unmountRun();
  renderBreath();
}

async function finish(){
  if (!R || R.phase === "done") return;
  cancelAnimationFrame(raf); keepAwake(false);
  const holds = R.holds.filter(Boolean);
  const prevBest = stats().best;
  R.phase = "done";
  R.summary = null;
  unmountRun();
  if (!holds.length){ R = null; renderBreath(); return; }
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
  R.view.lastPh = ph;
  if (R.view.ph === ph) return;
  R.view.ph = ph;
  const box = $("brRun"); if (box) box.dataset.ph = ph;
  const meta = PHASE[ph] || {};
  const lb = $("brPhase"); if (lb) lb.textContent = R.paused ? L("متوقف") : L(meta.label || "");
  const tp = $("brTip");
  if (tp){
    const free = ph === "hold" && R.cfg.holdMode === "free";
    tp.textContent = free ? L("احبس حتى تحس بالحاجة للتنفس، ثم اضغط «تنفّس الآن».") : L(meta.tip || "");
  }
  paintButtons();
}
function setTop(t){
  if (R.view.top === t) return;
  R.view.top = t;
  const el = $("brRound"); if (!el) return;
  el.textContent = t || L("الجولة {0} من {1}", R.round, R.cfg.rounds);
}
function setMode(m){
  if (R.view.mode === m) return;
  R.view.mode = m;
  const st = $("brStage"); if (st) st.dataset.mode = m;
}
function setCard(k, n){
  const key = k + (n || "");
  if (R.view.card === key) return;
  R.view.card = key;
  document.querySelectorAll("#brStage .br-card").forEach(el => el.classList.toggle("on", el.dataset.card === k));
  if (k === "round"){ const t = $("brCardRound"); if (t) t.textContent = L("الجولة {0}", n); }
}
function setHex(s, dir, num, label, still){
  const v = R.view, d = hexPaths(s, still ? 0 : dir);
  for (let i = 0; i < 4; i++){ const p = $("brH" + i); if (p) p.setAttribute("d", d[i]); }
  const nm = $("brNum"), lb = $("brLbl");
  const big = s > .6 && !!label;
  if (nm){
    const txt = num == null ? "" : String(num);
    if (v.num !== txt){ v.num = txt; nm.textContent = txt; }
    nm.setAttribute("font-size", f1(big ? 60 : 14 + 58 * s));
    nm.setAttribute("y", big ? "26" : "3");
    nm.classList.toggle("rec", !!still);
  }
  if (lb){
    if (v.lbl !== label){ v.lbl = label; lb.textContent = label || ""; }
    lb.setAttribute("y", num == null ? "4" : "-30");
    lb.setAttribute("opacity", f1(clamp((s - .55) / .3, 0, 1)));
  }
}
function setFan(frac, time){
  const deg = clamp(frac, 0, 1) * 360;
  for (let i = 0; i < FAN_LAYERS.length; i++){
    const [rr, , lag] = FAN_LAYERS[i], p = $("brF" + i);
    if (p) p.setAttribute("d", sector(rr, Math.max(0, deg - lag * Math.min(1, deg / 40))));
  }
  const tm = $("brTime");
  if (tm && R.view.time !== time){ R.view.time = time; tm.textContent = time; }
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
  const key = icon + label;
  if (R.view.btn === key) return;
  R.view.btn = key;
  b.innerHTML = `<svg class="ic"><use href="#${icon}"/></svg><span>${label}</span>`;
  b.classList.toggle("br-now", !R.paused && R.phase === "hold");
}
function paintFrame(){
  if (!R) return;
  R.view.ph = null; R.view.top = null;
  setTop("");
  paintRounds();
}

function runHTML(){
  return `
  <div class="br-run" id="brRun" data-ph="ready">
    <canvas class="br-kal" id="brKal" aria-hidden="true"></canvas>
    <div class="br-vig" aria-hidden="true"></div>
    <div class="br-run-top">
      <span class="br-pill" id="brRound"></span>
      <span class="br-pill br-phase" id="brPhase"></span>
    </div>
    <div class="br-stage" id="brStage" data-mode="card" aria-live="off">
      <svg class="br-svg" viewBox="-120 -120 240 240" aria-hidden="true">
        <defs><linearGradient id="brCream" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF9E3"/><stop offset="1" stop-color="#FFE7A8"/></linearGradient></defs>
        <g class="br-hex">
          ${HEX_LAYERS.map(([col], i) => `<path id="brH${i}" fill="${col}"/>`).join("")}
          <text class="br-hlbl" id="brLbl" x="0" y="-30"></text>
          <text class="br-hnum" id="brNum" x="0" y="3"></text>
        </g>
        <g class="br-fan">
          ${FAN_LAYERS.map((l, i) => `<path id="brF${i}" fill="${l[1]}"/>`).join("")}
          <circle class="br-pivot" cx="0" cy="0" r="8.5"/>
          <text class="br-time" id="brTime" x="0" y="52"></text>
        </g>
      </svg>
      <div class="br-card" data-card="lungs"><span class="br-tile">${ICON.lungs}</span></div>
      <div class="br-card br-two" data-card="posture">
        <span class="br-tile">${ICON.sit}</span><span class="br-tile wide">${ICON.lie}</span>
      </div>
      <div class="br-card" data-card="round"><span class="br-rtile" id="brCardRound"></span></div>
    </div>
    <p class="br-tip" id="brTip"></p>
    <div class="br-rounds" id="brRounds"></div>
    <div class="br-ctrl">
      <button class="btn btn-lg br-main" id="brMain" data-act="main"></button>
      <button class="btn btn-sq br-glass" data-act="skip" aria-label="${esc(L("التالي"))}"><svg class="ic"><use href="#i-next"/></svg></button>
      <button class="btn btn-sq br-glass" data-act="stop" aria-label="${esc(L("إنهاء"))}"><svg class="ic"><use href="#i-stop"/></svg></button>
    </div>
  </div>`;
}

/* يرسم شاشة الجلسة فوق التطبيق ويشغّل الخلفية */
function mountRun(){
  $("breathBox").innerHTML = runHTML();
  document.documentElement.classList.add("br-lock");
  document.body.classList.add("br-live");
  paintMeta();
  R.view = {};
  const cv = $("brKal");
  kal = cv && cv.getContext ? makeKaleido(cv) : null;
  kalLast = 0;
  if (kal) kal.draw(performance.now() / 1000);
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
function segRow(k, title, opts, sub){
  return `
  <div class="br-row col">
    <span class="br-lab"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>
    <div class="seg">${opts.map(([v, t]) =>
      `<button type="button" data-seg="${k}" data-v="${v}" class="${String(cfg[k]) === String(v) ? "on" : ""}">${t}</button>`).join("")}</div>
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
function summaryText(){
  const pk = presetOf(cfg);
  const name = pk === "custom" ? L("مخصّصة") : L(PRESETS.find(p => p.k === pk).name);
  const holds = cfg.holdMode === "fixed"
    ? Array.from({ length:cfg.rounds }, (_, i) => mmss(holdFor(cfg, i + 1))).join(" · ")
    : L("حبس حتى تحتاج");
  return { name, line: L("{0} جولات × {1} نفَس", cfg.rounds, cfg.breaths), holds };
}

function setupHTML(){
  const st = stats();
  const pk = presetOf(cfg);
  const fixed = cfg.holdMode === "fixed";
  const sm = summaryText();
  const holdSub = fixed && cfg.holdStep
    ? L("الجولة الأخيرة {0}", mmss(holdFor(cfg, cfg.rounds))) : "";
  return `
  <div class="br-hero">
    <canvas class="br-hero-kal" id="brHeroKal" aria-hidden="true"></canvas>
    <div class="br-hero-vig" aria-hidden="true"></div>
    ${hexSVG(.62, 1, null, "br-hero-hex")}
    <div class="br-hero-tx">
      <span class="br-eyebrow">${L("طريقة ويم هوف")}</span>
      <h2>${L("التنفس العميق")}</h2>
      <p>${L("أنفاس عميقة، ثم حبس النفس، ثم شهيق عميق ونحبس النفس — جولة بعد جولة.")}</p>
    </div>
    <div class="br-plan">
      <b>${esc(sm.name)}</b>
      <span>${esc(sm.line)}</span>
      <span>${L("الحبس")}: ${esc(sm.holds)}</span>
    </div>
    <button class="btn br-go" data-act="start"><svg class="ic"><use href="#i-play"/></svg><span>${L("ابدأ الجلسة")}</span></button>
    <p class="br-est">${esc(estText())}</p>
    <div class="br-hero-stats">
      <div><b>${st.best ? mmss(st.best) : "—"}</b><small>${L("أفضل حبس")}</small></div>
      <div><b>${st.count}</b><small>${L("الجلسات")}</small></div>
      <div><b>${st.week}</b><small>${L("هذا الأسبوع")}</small></div>
    </div>
  </div>

  <div class="br-sec">
    <div class="head-row"><h2>${L("خصّص جلستك")}</h2>
      <span class="count">${esc(sm.name)}</span></div>
    <div class="chips br-presets">${PRESETS.map(p =>
      `<button type="button" class="chip ${pk === p.k ? "on" : ""}" data-preset="${p.k}">${L(p.name)}</button>`).join("")}</div>
    ${pk === "basic" ? `<p class="br-note">${L("الأساسي يطابق فيديو ويم هوف للمبتدئين: 3 جولات بطيئة، والحبس يزيد 30 ثانية كل جولة.")}</p>` : ""}
    <div class="card br-cfg">
      ${stepRow("rounds",  L("عدد الجولات"), "", cfg.rounds)}
      ${stepRow("breaths", L("الأنفاس في كل جولة"), L("ويم هوف يوصي بـ 30 إلى 40"), cfg.breaths)}
      ${segRow("pace", L("سرعة التنفس"), [["slow", L("بطيء")], ["mid", L("متوسط")], ["fast", L("سريع")]],
               L("نفَس كل {0} ثانية", (PACES[cfg.pace].inh + PACES[cfg.pace].exh).toFixed(1)))}
      ${segRow("holdMode", L("حبس النفس"), [["free", L("حتى أحتاج")], ["fixed", L("وقت محدد")]])}
      ${fixed ? stepRow("hold", L("مدة الحبس"), holdSub, mmss(cfg.hold)) : ""}
      ${fixed ? segRow("holdStep", L("زيادة الحبس كل جولة"), [[0, L("بدون")], [15, L("{0} ث", 15)], [30, L("{0} ث", 30)]]) : ""}
      ${stepRow("recover", L("نحبس النفس"), L("بعد الشهيق العميق في نهاية كل جولة"), L("{0} ث", cfg.recover))}
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
      <li><b>${L("الأنفاس")}</b><span>${L("تنفّس بعمق من البطن ثم الصدر، وأطلق بدون جهد. تابع السداسي: يكبر مع الشهيق ويصغر لنقطة مع الزفير.")}</span></li>
      <li><b>${L("حبس النفس")}</b><span>${L("بعد آخر نفَس عميق أطلق الهواء واحبس نفسك. المروحة الزرقاء تعدّ وقت الحبس.")}</span></li>
      <li><b>${L("نحبس النفس")}</b><span>${L("شهيق عميق واحبسه حتى ينتهي العدّ، ثم أطلقه وابدأ الجولة التالية.")}</span></li>
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
    ${hexSVG(.55, 1, null, "br-done-hex")}
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
      mountRun();
      paintFrame();
      step();
    }
    paintButtons();
    return;
  }
  box.innerHTML = setupHTML();
  const hc = $("brHeroKal");
  if (hc && hc.getContext){ try { makeKaleido(hc, 11).draw(40); } catch(e){} }
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
  unmountRun();
  delete document.body.dataset.zone;
}
const MOUNTAIN_META = { light:"#FFF6EF", dark:"#150E15" };      // نفس قيم applyTheme في app.js
export function paintMeta(){
  const m = document.querySelector('meta[name="theme-color"]');
  if (!m) return;
  if (document.body.classList.contains("br-live")){ m.content = LIVE_META; return; }
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
      const k = t.dataset.seg, v = t.dataset.v;
      return change(() => { cfg[k] = k === "holdStep" ? +v : v; });
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
    }
  });

  box.addEventListener("toggle", e => {
    if (e.target.classList && e.target.classList.contains("br-how")) howOpen = e.target.open;
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && R && !R.paused && R.phase !== "done") keepAwake(true);
  });
}
