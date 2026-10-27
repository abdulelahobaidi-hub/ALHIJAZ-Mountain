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
   الخلفية — ماندالا ضوء مائي (WebGL)
   انعكاسات ضوء على الماء تُطوى ١٢ مرة حول المركز، وتتسع وتضيء قليلاً مع
   الشهيق. تُرسم بدقة الشاشة فتبقى حادة وناعمة — بلا نقاط ولا ضبابية.
   إن لم يتوفر WebGL تبقى خلفية متدرجة ثابتة من CSS.
   ============================================================ */
const WATER_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uR; uniform float uT; uniform float uB;
const vec3 DEEP=vec3(0.020,0.067,0.215);
const vec3 ROYAL=vec3(0.063,0.235,0.650);
const vec3 AZURE=vec3(0.118,0.443,0.882);
const vec3 CYAN=vec3(0.380,0.850,1.000);
const vec3 ICE=vec3(0.900,0.985,1.000);
float caustic(vec2 uv, float t){
  vec2 p=mod(uv*6.2831853,6.2831853)-250.;
  vec2 i=p; float c=1.; const float inten=.0055;
  for(int n=0;n<4;n++){
    float tt=t*(1.-3.5/float(n+1));
    i=p+vec2(cos(tt-i.x)+sin(tt+i.y), sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+tt)/inten), p.y/(cos(i.y+tt)/inten)));
  }
  c/=4.; c=1.17-pow(c,1.4);
  return clamp(pow(abs(c),7.),0.,1.);
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*uR)/min(uR.x,uR.y);
  p*=1.0-0.05*uB;
  float r=length(p);
  float a=atan(p.y,p.x)+uT*.01;
  const float N=12.; float seg=6.2831853/N;
  a=mod(a,seg); a=abs(a-seg*.5);
  vec2 q=r*vec2(cos(a),sin(a));
  float t=uT*.18+23.;
  float c=caustic(q*.62+vec2(.13,.29), t);
  float c2=caustic(q*1.1+vec2(.71,.05), t*.7+5.);
  vec3 base=mix(AZURE,ROYAL,smoothstep(.0,1.1,r));
  vec3 col=base;
  col=mix(col,CYAN,clamp(c*1.1+c2*.5,0.,1.)*.85);
  col=mix(col,ICE,pow(c,2.2)*.55);
  float v=smoothstep(1.6,.25,r);
  col=mix(DEEP,col,.25+.75*v);
  col+=CYAN*(.06+.14*uB)*exp(-r*r*4.);
  gl_FragColor=vec4(col,1.);
}
`;
const WATER_VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

function makeWater(cv, keep = false){
  let gl = null;
  try { gl = cv.getContext("webgl", { antialias:false, alpha:false, preserveDrawingBuffer:keep, powerPreference:"low-power" }); } catch(e){}
  if (!gl) return null;
  const sh = (type, src) => {
    const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  };
  let pr;
  try {
    pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, WATER_VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, WATER_FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
  } catch(e){ console.warn("breath bg", e); return null; }
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, "uR"), uT = gl.getUniformLocation(pr, "uT"), uB = gl.getUniformLocation(pr, "uB");
  let w = 0, h = 0;
  function draw(t, breath){
    const k = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.max(2, Math.round((cv.clientWidth || 360) * k)), nh = Math.max(2, Math.round((cv.clientHeight || 640) * k));
    if (nw !== w || nh !== h){ w = cv.width = nw; h = cv.height = nh; gl.viewport(0, 0, w, h); }
    gl.uniform2f(uR, w, h); gl.uniform1f(uT, t); gl.uniform1f(uB, breath || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function free(){ try { const x = gl.getExtension("WEBGL_lose_context"); x && x.loseContext(); } catch(e){} }
  return { draw, free };
}

/* صورة ثابتة من الخلفية لبطاقة البداية — تُرسم مرة واحدة وتُحفظ */
let heroBg = null;
function heroImage(){
  if (heroBg !== null) return heroBg;
  heroBg = "";
  try {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:-9999px;width:520px;height:420px";
    document.body.appendChild(cv);
    const wt = makeWater(cv, true);
    if (wt){ wt.draw(64, .3); heroBg = cv.toDataURL("image/jpeg", .86); wt.free(); }
    cv.remove();
  } catch(e){ heroBg = ""; }
  return heroBg;
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
/* طبقات السداسي من الخارج للداخل: معرّف التدرّج، حجمها والشكل نقطة، حجمها والشكل كامل.
   الطبقات تلتف كلها في اتجاه واحد وبنسب متدرجة وهي صغيرة، وتستقيم معاً كلما امتلأ —
   فتنفتح مثل بتلات منتظمة لا تهتز. */
const HEX_LAYERS = [
  ["hxA", 1,   1   ],
  ["hxB", .84, .972],
  ["hxC", .71, .95 ],
  ["hxD", .57, .93 ]
];
const HEX_MIN = 13, HEX_MAX = 108, HEX_TURN = [0, 7, 14, 21];
const HEX_DEFS = (pre) => `
  <linearGradient id="${pre}hxA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7A245"/><stop offset="1" stop-color="#D9631A"/></linearGradient>
  <linearGradient id="${pre}hxB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC06A"/><stop offset="1" stop-color="#F08A2C"/></linearGradient>
  <linearGradient id="${pre}hxC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3A4"/><stop offset="1" stop-color="#F9BC5E"/></linearGradient>
  <radialGradient id="${pre}hxD" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#FFFDF4"/><stop offset=".7" stop-color="#FFF1CC"/><stop offset="1" stop-color="#FFE3A2"/></radialGradient>`;

/* s: الحجم من ٠ (نقطة) إلى ١ (كامل) */
function hexPaths(s){
  s = clamp(s, 0, 1);
  const R0 = lerp(HEX_MIN, HEX_MAX, s);
  const cut = lerp(.5, .075, Math.pow(s, .75));
  const turn = 1 - ease(s);
  return HEX_LAYERS.map(([, a, b], i) => rhex(R0 * lerp(a, b, s), cut, HEX_TURN[i] * turn));
}
function hexSVG(s, cls, pre){
  const d = hexPaths(s);
  return `<svg class="${cls}" viewBox="-120 -120 240 240" aria-hidden="true">
    <defs>${HEX_DEFS(pre)}</defs>
    ${HEX_LAYERS.map(([g], i) => `<path d="${d[i]}" fill="url(#${pre}${g})"/>`).join("")}
  </svg>`;
}

/* قطاع دائري يبدأ من الساعة ١٢ ويتّسع عكس عقارب الساعة */
function sector(Rr, deg){
  if (deg <= .2) return "";
  if (deg >= 359.8) return `M0 ${-Rr}A${Rr} ${Rr} 0 1 0 0 ${Rr}A${Rr} ${Rr} 0 1 0 0 ${-Rr}Z`;
  const a = (-90 - deg) * Math.PI / 180;
  return `M0 0L0 ${-Rr}A${Rr} ${Rr} 0 ${deg > 180 ? 1 : 0} 0 ${f1(Rr * Math.cos(a))} ${f1(Rr * Math.sin(a))}Z`;
}
/* طبقات المروحة من الخارج للداخل: نصف القطر، معرّف التدرّج، تأخّر الحافة بالدرجات */
const FAN_LAYERS = [[96, "fnA", 0], [80, "fnB", 2.5], [63, "fnC", 5], [46, "fnD", 7.5]];
const FAN_DEFS = `
  <radialGradient id="fnA" cx="0" cy="0" r="96" gradientUnits="userSpaceOnUse"><stop offset=".5" stop-color="#E9ECFF" stop-opacity=".55"/><stop offset="1" stop-color="#F3F5FF" stop-opacity=".92"/></radialGradient>
  <radialGradient id="fnB" cx="0" cy="0" r="80" gradientUnits="userSpaceOnUse"><stop offset=".4" stop-color="#C3CBFF" stop-opacity=".7"/><stop offset="1" stop-color="#CDD4FF" stop-opacity=".96"/></radialGradient>
  <radialGradient id="fnC" cx="0" cy="0" r="63" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8291FA"/><stop offset="1" stop-color="#9DA9FF"/></radialGradient>
  <radialGradient id="fnD" cx="0" cy="0" r="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3B4BDB"/><stop offset="1" stop-color="#5E6DF4"/></radialGradient>`;

/* ============================================================
   الأيقونات — Material Symbols Rounded (وزن 300) من Google، رخصة Apache 2.0
   ============================================================ */
const MS = d => `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  lungs: MS("m480-528-88.39 88q-6.64 6.69-15.78 6.5-9.14-.19-15.83-6.9-6.69-6.7-6.69-15.92 0-9.22 6.69-15.91l97.31-97.08v-278q0-9.64 6.58-16.17 6.58-6.52 16.31-6.52 9.72 0 16.11 6.52 6.38 6.53 6.38 16.17v278.13L600-471.61q6.69 6.64 6.5 15.78-.19 9.14-6.9 15.83-6.7 6.69-15.92 6.69-9.22 0-15.91-6.69L480-528ZM202.69-130q-42.92 0-72.8-29.89Q100-189.77 100-232.69v-167.46q0-5 .81-10.12.81-5.11 3.19-10.11L203.39-679q12.38-32.15 40.18-51.58Q271.36-750 305.08-750q40.15 0 68.88 27.09 28.73 27.09 28.73 66.6v45.93q0 9.64-6.58 16.16-6.58 6.53-16.3 6.53-9.73 0-16.12-6.53-6.38-6.52-6.38-16.16v-45.93q0-20.68-15.94-34.49-15.94-13.82-37.2-13.82-20.02 0-35.67 11.31-15.65 11.31-22.58 29.7L145.39-403.85v171.16q0 24.35 16.47 40.83 16.48 16.48 40.83 16.48H337.3q24.34 0 40.83-16.48t16.49-40.83v-50q0-9.65 6.58-16.17 6.58-6.53 16.3-6.53 9.73 0 16.12 6.53 6.38 6.52 6.38 16.17v50q0 42.92-30.18 72.8Q379.65-130 337.31-130H202.69Zm554.62 0H622.69q-42.79 0-72.74-29.89Q520-189.77 520-232.69v-50q0-9.65 6.58-16.17 6.58-6.53 16.31-6.53 9.72 0 16.11 6.53 6.38 6.52 6.38 16.17v50q0 24.35 16.48 40.83 16.48 16.48 40.83 16.48H757.3q24.33 0 40.82-16.48 16.49-16.48 16.49-40.83v-171.16L713.69-663.61q-6.92-18.39-22.38-29.7-15.46-11.31-35.33-11.31-21.14 0-37.21 13.82-16.08 13.81-16.08 34.49v45.93q0 9.64-6.58 16.16-6.58 6.53-16.31 6.53-9.72 0-16.11-6.53-6.38-6.52-6.38-16.16v-45.93q0-39.51 28.76-66.6Q614.84-750 655.16-750q33.84 0 61.45 19.42 27.62 19.43 39.62 51.58l100.15 258.62q2 5 2.81 10.11.81 5.12.81 10.12v167.46q0 42.92-29.97 72.8Q800.06-130 757.31-130ZM360-440.39Zm239.61.39Z"),
  sit:   MS("M264.08-173.85q-23.31 0-38.39-14.3-15.07-14.31-15.07-37.24 0-16.07 8.23-29.88 8.23-13.81 23.3-19.65l173.54-68.77v-154.93q-66.54 79.93-125.15 119.97-58.62 40.03-134.39 48.96-8.92 1.61-16-5.27-7.07-6.89-7.07-16.42 0-9.7 6.77-16.39 6.77-6.69 16.07-8.31 56.85-7 106.04-37 49.19-30 90.35-80.61l57.23-63.85q8.46-10.84 20.81-17.88 12.34-7.04 26.8-7.04h45.7q14.46 0 27.11 7.04 12.65 7.04 21.5 17.88l56.85 63.85q42.77 49.38 91.15 80 48.39 30.61 104.62 37.61 9.3 1.62 16.07 8.31t6.77 16.39q0 9.53-7.07 16.42-7.08 6.88-16 5.27-75.77-8.93-134.39-48.96-58.61-40.04-125.15-119.97v154.93l173.54 68.77q15.07 5.84 23.3 19.65 8.23 13.81 8.23 29.88 0 22.93-15.07 37.24-15.08 14.3-38.39 14.3H397.15v-6.38q0-24.85 14.47-39.5 14.46-14.66 39.3-14.66h134.16q8.38 0 14.19-5.8 5.81-5.81 5.81-14.2 0-8.38-5.81-14.19-5.81-5.81-14.19-5.81H450.92q-42.07 0-67.3 25.85-25.24 25.85-25.24 68.31v6.38h-94.3ZM480-644.77q-28.46 0-48.62-20.15-20.15-20.16-20.15-48.62 0-28.46 20.15-48.61 20.16-20.16 48.62-20.16 28.46 0 48.62 20.16 20.15 20.15 20.15 48.61t-20.15 48.62q-20.16 20.15-48.62 20.15Z"),
  lie:   MS("M399.62-420q-12.26 0-20.56-8.29-8.29-8.3-8.29-20.56v-165q0-18.98 13.59-32.56Q397.94-660 416.92-660h298q55.86 0 94.78 38.8 38.91 38.81 38.91 94.51v77.84q0 12.26-8.48 20.56-8.48 8.29-20.36 8.29H399.62Zm16.53-194.61v149.22-149.22Zm410.39 309.99H133.46q-9.64 0-16.16-6.58-6.53-6.58-6.53-16.3 0-9.73 6.53-16.12 6.52-6.38 16.16-6.38h693.08q9.64 0 16.16 6.58 6.53 6.58 6.53 16.31 0 9.72-6.53 16.11-6.52 6.38-16.16 6.38ZM213.08-420q-43.08 0-72.69-29.62-29.62-29.61-29.62-72.69 0-43.07 29.62-72.69 29.61-29.61 72.69-29.61 43.07 0 72.69 29.61 29.61 29.62 29.61 72.69 0 43.08-29.61 72.69Q256.15-420 213.08-420Zm-.02-45.39q24.19 0 40.57-16.36Q270-498.11 270-522.29q0-24.19-16.36-40.57-16.36-16.37-40.55-16.37-24.19 0-40.56 16.36t-16.37 40.55q0 24.19 16.36 40.56t40.54 16.37Zm203.09 0h387.08v-61.3q0-36-25.94-61.96t-62.37-25.96H416.15v149.22Zm-203.07-56.92Z"),
  spa:   MS("M457.77-105.16q-63.62-11.23-126.38-43.26-62.77-32.04-112.39-86.35-49.61-54.31-80.07-131.77-30.47-77.46-30.47-181.15v-8.46q0-10.23 7.54-17.77 7.54-7.54 17.77-7.54h7.69q48 0 108.2 21.85 60.19 21.84 102.73 53.84 5.69-74 34.23-154.27 28.53-80.26 71.46-143.42 8.84-12.84 21.92-12.84 13.08 0 21.92 12.84 42.93 63.16 71.46 143.81Q601.92-579 607.61-505q41.39-29.23 100.81-52.27 59.42-23.04 109.35-24.19l9.61-.38q9.85-.39 17.39 7.15 7.54 7.54 7.15 17.38l-.38 10.39q-2.7 93.69-29.12 167.5Q796-305.62 751-250.92q-45 54.69-105.46 90.76-60.46 36.08-130.23 53.08-11.77 3.16-28.77 3.73-17 .58-28.77-1.81ZM493-146.77Q482-326 387-419.31q-95-93.3-232.54-116.15h-.19.19Q166.69-350.62 264.39-258 362.08-165.39 493-146.77q1 1-.5.5t.5-.5Zm-96.08-327.92q23 20 45.54 50.19 22.54 30.19 36.92 56.58 13.24-26.77 36.97-56.77 23.73-30 46.73-50 3.84-66.23-20.31-137.42-24.15-71.2-62.77-142.5-.62-.62 0 .19t0-.19q-39.23 71.92-63.08 142.3-23.84 70.39-20 137.62ZM504.54-317q12 36.46 20.42 72.08 8.42 35.61 13.42 83.46 48.93-17.77 94.93-46.46 46-28.7 82.34-73.54 36.35-44.85 60.5-107.35 24.16-62.5 29.39-146.65 0-1.62 0 0 0 1.61 0 0-104.46 15.85-185.08 74.73Q539.85-401.85 504.54-317Z")
};

/* ============================================================
   المحرّك
   ============================================================
   المراحل: ready ← breathe ← last ← hold ← recover ← release ← (breathe | rest) ← done
   الزمن يُحسب من ساعة الجهاز، فلا ينحرف لو تأخّر الرسم. */
let R = null;          // الجلسة الجارية
let raf = 0;
let water = null;      // خلفية الماندالا للجلسة
let waterLast = 0;
let glow = 0, glowTo = 0; // إضاءة الخلفية: تتبع حجم السداسي بنعومة
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
    if (water && now - waterLast >= gap){
      waterLast = now;
      glow += (glowTo - glow) * .12;
      water.draw(now / 1000, glow);
    }
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
      setPh("rest"); setMode("card"); setCard("rest");
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
  if (water) water.free();
  water = null;
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
  if (k) glowTo = .35;
  document.querySelectorAll("#brStage .br-card").forEach(el => el.classList.toggle("on", el.dataset.card === k));
  if (k === "round"){ const t = $("brCardRound"); if (t) t.textContent = n; }
}
function setHex(s, dir, num, label, still){
  const v = R.view, d = hexPaths(s);
  glowTo = s;
  for (let i = 0; i < 4; i++){ const p = $("brH" + i); if (p) p.setAttribute("d", d[i]); }
  const nm = $("brNum"), lb = $("brLbl");
  const big = s > .6 && !!label;
  if (nm){
    const txt = num == null ? "" : String(num);
    if (v.num !== txt){ v.num = txt; nm.textContent = txt; }
    nm.setAttribute("font-size", f1(big ? 58 : 13 + 61 * s));
    nm.setAttribute("y", big ? "24" : "2");
    nm.classList.toggle("rec", !!still);
  }
  if (lb){
    if (v.lbl !== label){ v.lbl = label; lb.textContent = label || ""; }
    lb.setAttribute("y", num == null ? "4" : "-30");
    lb.setAttribute("opacity", f1(clamp((s - .55) / .3, 0, 1)));
  }
}
function setFan(frac, time){
  glowTo = 0;
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
    <canvas class="br-bg" id="brBg" aria-hidden="true"></canvas>
    <div class="br-run-top">
      <span class="br-pill" id="brRound"></span>
      <span class="br-pill br-phase" id="brPhase"></span>
    </div>
    <div class="br-stage" id="brStage" data-mode="card" aria-live="off">
      <svg class="br-svg" viewBox="-120 -120 240 240" aria-hidden="true">
        <defs>${HEX_DEFS("")}${FAN_DEFS}</defs>
        <g class="br-hex">
          ${HEX_LAYERS.map(([g], i) => `<path id="brH${i}" fill="url(#${g})"/>`).join("")}
          <text class="br-hlbl" id="brLbl" x="0" y="-30"></text>
          <text class="br-hnum" id="brNum" x="0" y="2"></text>
        </g>
        <g class="br-fan">
          <circle class="br-track" cx="0" cy="0" r="96"/>
          ${FAN_LAYERS.map((l, i) => `<path id="brF${i}" fill="url(#${l[1]})"/>`).join("")}
          <circle class="br-pivot-glow" cx="0" cy="0" r="16"/>
          <circle class="br-pivot" cx="0" cy="0" r="7.5"/>
        </g>
      </svg>
      <p class="br-time" id="brTime"></p>
      <div class="br-card" data-card="lungs">
        <span class="br-glasstile">${ICON.lungs}</span>
        <p>${L("خذ وضعية مريحة")}</p>
      </div>
      <div class="br-card" data-card="posture">
        <div class="br-pair">
          <span class="br-glasstile sm">${ICON.sit}<small>${L("جالساً")}</small></span>
          <span class="br-or">${L("أو")}</span>
          <span class="br-glasstile sm">${ICON.lie}<small>${L("مستلقياً")}</small></span>
        </div>
        <p>${L("أرخِ كتفيك وفكّك")}</p>
      </div>
      <div class="br-card" data-card="round">
        <span class="br-roundcard"><small>${L("الجولة")}</small><b id="brCardRound"></b></span>
      </div>
      <div class="br-card" data-card="rest">
        <span class="br-glasstile">${ICON.spa}</span>
        <p>${L("تنفّس طبيعياً")}</p>
      </div>
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
  const cv = $("brBg");
  water = cv ? makeWater(cv) : null;
  if (!water && cv) cv.classList.add("flat");
  waterLast = 0; glow = glowTo = .35;
  if (water) water.draw(performance.now() / 1000, glow);
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
    <div class="br-hero-bg" id="brHeroBg" aria-hidden="true"></div>
    ${hexSVG(.7, "br-hero-hex", "h-")}
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
    ${hexSVG(.62, "br-done-hex", "d-")}
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
  const hb = $("brHeroBg"), img = heroImage();
  if (hb && img) hb.style.backgroundImage = `url(${img})`;
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
