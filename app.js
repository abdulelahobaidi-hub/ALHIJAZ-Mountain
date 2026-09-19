/* ============================================================
   نادي جبال الحجاز — app logic
   - Google sign-in + per-user Firestore database (users/{uid}/…)
   - Local fallback so the app works offline / before Firebase setup
   ============================================================ */

import { initSocial, socialBoot, socialTeardown, socialAfterWorkout,
         renderClub, refreshClub, memberId } from "./social.js";

/* ---------------- exercise library ---------------- */
const LIB = [
  { key:"N", name:"نط الحبل",        work:60, rest:0,  tip:"إيقاع ثابت، الكتفين مرتخية" },
  { key:"P", name:"بوش اب",          work:45, rest:15, tip:"الجسم خط مستقيم من الكعب للرأس" },
  { key:"S", name:"ضغط أكتاف",       work:45, rest:15, tip:"شدّ البطن ولا تقوّس ظهرك" },
  { key:"B", name:"بلانك",           work:45, rest:15, tip:"ثبّت الحوض، لا ترفع ردفك" },
  { key:"Q", name:"سكوات",           work:45, rest:15, tip:"الكعب ثابت على الأرض" },
  { key:"L", name:"لانجز",           work:45, rest:15, tip:"الركبة الأمامية فوق الكاحل" },
  { key:"M", name:"متسلق الجبل",     work:40, rest:20, tip:"الحوض منخفض والإيقاع سريع" },
  { key:"U", name:"بيربي",           work:40, rest:20, tip:"نزول ودفع وقفزة — نفس منتظم" },
  { key:"C", name:"تمارين البطن",    work:45, rest:15, tip:"ارفع بالبطن لا بالرقبة" },
  { key:"H", name:"جسر الورك",       work:45, rest:15, tip:"اعصر المؤخرة في الأعلى" },
  { key:"J", name:"قفز الفتح والضم", work:45, rest:15, tip:"نزول خفيف على مشط القدم" },
  { key:"T", name:"تمديد الظهر",     work:40, rest:20, tip:"ارفع الصدر ببطء" }
];
const byKey = k => LIB.find(e => e.key === k);

/* ---------------- default plan ---------------- */
const DEFAULT_SEQ = ["N","P","N","S","N","B","N","P","N","Q","N","S","N","B","N","P","N","Q","N","B"];
function defaultPlan(){
  return {
    id: "abdulelah-default",
    name: "جدول عبدالاله الرياضي",
    target: 25, repeat: 1, warm: 180, cool: 120,
    items: DEFAULT_SEQ.map(k => {
      const e = byKey(k);
      return { key:e.key, name:e.name, work:e.work, rest:e.rest };
    }),
    updatedAt: Date.now()
  };
}

/* ---------------- state ---------------- */
const S = {
  mode: null,            // "cloud" | "local"
  user: null,            // {uid, name, email, photo}
  plans: [],
  sessions: [],
  editing: null,
  run: null,
  fb: null               // {auth, db, mods}
};

const $ = id => document.getElementById(id);
const pad = n => (n < 10 ? "0" : "") + n;
const mmss = s => { s = Math.max(0, Math.ceil(s - 0.001)); return Math.floor(s/60) + ":" + pad(s%60); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dayKey = d => { const x = new Date(d); return x.getFullYear()+"-"+pad(x.getMonth()+1)+"-"+pad(x.getDate()); };

/* custom confirm sheet — avoids the browser's own dialog */
function ask(title, text, yes = "نعم، احذف"){
  return new Promise(resolve => {
    $("cfTitle").textContent = title;
    $("cfText").textContent = text;
    $("cfYes").textContent = yes;
    $("confirm").hidden = false;
    const done = v => {
      $("confirm").hidden = true;
      $("cfYes").onclick = null; $("cfNo").onclick = null;
      resolve(v);
    };
    $("cfYes").onclick = () => done(true);
    $("cfNo").onclick  = () => done(false);
  });
}

function toast(msg, ms = 2600){
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------------- plan maths ---------------- */
function planSeconds(p){
  const one = p.items.reduce((a,i) => a + (+i.work||0) + (+i.rest||0), 0);
  const reps = Math.max(1, +p.repeat || 1);
  const lastRest = p.items.length ? (+p.items[p.items.length-1].rest || 0) : 0;
  return (+p.warm||0) + one*reps - lastRest + (+p.cool||0);
}
function planRounds(p){ return p.items.length * Math.max(1, +p.repeat || 1); }

function buildSegments(p){
  const segs = [];
  const reps = Math.max(1, +p.repeat || 1);
  const total = planRounds(p);
  if (+p.warm > 0) segs.push({ kind:"prep", phase:"إحماء", name:"إحماء وتدوير مفاصل", dur:+p.warm, tip:"ارفع نبضك بالتدريج" });
  let r = 0;
  for (let rep = 0; rep < reps; rep++){
    p.items.forEach((it, i) => {
      r++;
      const src = byKey(it.key);
      segs.push({ kind:"work", phase:`الجولة ${r} من ${total}`, name:it.name, dur:+it.work||30,
                  tip: src ? src.tip : "ركّز على الأداء الصحيح", round:r });
      const isLast = (rep === reps-1) && (i === p.items.length-1);
      if ((+it.rest||0) > 0 && !isLast)
        segs.push({ kind:"rest", phase:"راحة", name:"استعد", dur:+it.rest, tip:"تنفّس عميق", round:r });
    });
  }
  if (+p.cool > 0) segs.push({ kind:"prep", phase:"تهدئة", name:"إطالة", dur:+p.cool, tip:"أطل كل عضلة ٢٠ ثانية" });
  return segs;
}

/* ============================================================
   STORAGE — local always; cloud when signed in
   ============================================================ */
const LK = { plans:"hejaz.plans", sessions:"hejaz.sessions", mode:"hejaz.mode" };

function lsGet(k, fb){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e){ return fb; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

async function loadAll(){
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    const u = S.user.uid;
    try {
      const ps = await m.getDocs(m.collection(db, "users", u, "plans"));
      S.plans = ps.docs.map(d => ({ id:d.id, ...d.data() }));
      const ss = await m.getDocs(m.query(m.collection(db, "users", u, "sessions"), m.orderBy("at","desc"), m.limit(200)));
      S.sessions = ss.docs.map(d => ({ id:d.id, ...d.data() }));
    } catch(err){
      console.error(err);
      toast("تعذّر تحميل بياناتك من السحابة");
      S.plans = lsGet(LK.plans, []); S.sessions = lsGet(LK.sessions, []);
    }
  } else {
    S.plans = lsGet(LK.plans, []);
    S.sessions = lsGet(LK.sessions, []);
  }
  if (!S.plans.length){
    const p = defaultPlan();
    S.plans = [p];
    await savePlan(p);
  }
  S.plans.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  S.sessions.sort((a,b) => b.at - a.at);
}

async function savePlan(p){
  p.updatedAt = Date.now();
  const i = S.plans.findIndex(x => x.id === p.id);
  if (i >= 0) S.plans[i] = p; else S.plans.unshift(p);
  lsSet(LK.plans, S.plans);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "plans", p.id), p); }
    catch(err){ console.error(err); toast("انحفظ محلياً — تعذّر الحفظ في السحابة"); }
  }
}

async function removePlan(id){
  S.plans = S.plans.filter(p => p.id !== id);
  lsSet(LK.plans, S.plans);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "plans", id)); } catch(err){ console.error(err); }
  }
}

async function deleteSession(id){
  S.sessions = S.sessions.filter(s => s.id !== id);
  lsSet(LK.sessions, S.sessions);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "sessions", id)); }
    catch(err){ console.error(err); toast("انحذف محلياً — تعذّر الحذف من السحابة"); }
  }
}

async function saveSession(sess){
  S.sessions.unshift(sess);
  S.sessions = S.sessions.slice(0, 200);
  lsSet(LK.sessions, S.sessions);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "sessions", sess.id), sess); }
    catch(err){ console.error(err); }
  }
}

/* ============================================================
   AUTH
   ============================================================ */
const hasConfig = () =>
  typeof firebaseConfig === "object" && firebaseConfig &&
  firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("PASTE");

async function initFirebase(){
  if (S.fb) return S.fb;
  const V = "https://www.gstatic.com/firebasejs/10.12.5";
  const [appM, authM, fsM] = await Promise.all([
    import(`${V}/firebase-app.js`),
    import(`${V}/firebase-auth.js`),
    import(`${V}/firebase-firestore.js`)
  ]);
  const app  = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  const db   = fsM.getFirestore(app);
  S.fb = { app, auth, db, authM, m: { ...fsM } };
  return S.fb;
}

async function signInGoogle(){
  if (!hasConfig()){
    $("gateNote").textContent = "إعدادات Firebase غير مكتملة — افتح ملف firebase-config.js والصق بيانات مشروعك.";
    return;
  }
  $("gateNote").textContent = "جارٍ فتح نافذة جوجل…";
  try {
    const { auth, authM } = await initFirebase();
    const provider = new authM.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await authM.signInWithPopup(auth, provider);
    } catch(err){
      if (["auth/popup-blocked","auth/popup-closed-by-user","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment"].includes(err.code)){
        await authM.signInWithRedirect(auth, provider);
      } else throw err;
    }
  } catch(err){
    console.error(err);
    $("gateNote").textContent = "تعذّر تسجيل الدخول: " + (err.code || err.message);
  }
}

async function watchAuth(){
  if (!hasConfig()){
    $("gateNote").textContent = "لتفعيل المزامنة بين أجهزتك: أنشئ مشروع Firebase والصق بياناته في firebase-config.js";
    return;
  }
  try {
    const { auth, authM } = await initFirebase();
    authM.getRedirectResult(auth).catch(() => {});
    authM.onAuthStateChanged(auth, async (u) => {
      if (u){
        S.mode = "cloud";
        S.user = { uid:u.uid, name:u.displayName || "صديق الجبال", email:u.email || "", photo:u.photoURL || "" };
        lsSet(LK.mode, "cloud");
        await enterApp();
      } else if (S.mode === "cloud"){
        S.mode = null; S.user = null;
        lsSet(LK.mode, "");
        $("app").hidden = true; $("gate").hidden = false;
      }
    });
  } catch(err){
    console.error(err);
    $("gateNote").textContent = "تعذّر تحميل Firebase — تأكد من الاتصال بالإنترنت.";
  }
}

async function goGuest(){
  S.mode = "local";
  S.user = { uid:"local", name:"ضيف", email:"", photo:"" };
  lsSet(LK.mode, "local");
  await enterApp();
}

async function signOutNow(){
  $("sheet").hidden = true;
  lsSet(LK.mode, "");
  if (S.mode === "cloud" && S.fb){
    try { await S.fb.authM.signOut(S.fb.auth); } catch(e){}
  }
  S.mode = null; S.user = null; S.plans = []; S.sessions = [];
  socialTeardown();
  stopTimer();
  $("app").hidden = true; $("gate").hidden = false;
  $("gateNote").textContent = "";
}

/* ============================================================
   STREAK
   ============================================================ */
function streakInfo(){
  const days = new Set(S.sessions.filter(s => s.completed !== false).map(s => dayKey(s.at)));
  const today = new Date(); today.setHours(0,0,0,0);
  let cur = 0;
  const probe = new Date(today);
  if (!days.has(dayKey(probe))) probe.setDate(probe.getDate() - 1);   // yesterday still keeps it alive
  while (days.has(dayKey(probe))){ cur++; probe.setDate(probe.getDate() - 1); }

  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  sorted.forEach(k => {
    const d = new Date(k + "T00:00:00");
    run = (prev && (d - prev) === 86400000) ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  });
  return { current: cur, best, days, todayDone: days.has(dayKey(today)) };
}

/* ============================================================
   VIEWS
   ============================================================ */
function show(view){
  ["home","plans","build","log","run","club","group"].forEach(v => {
    const el = $("v-" + v); if (el) el.hidden = (v !== view);
  });
  document.querySelectorAll(".tabbar button").forEach(b =>
    b.classList.toggle("on", b.dataset.view === view || (view === "group" && b.dataset.view === "club")));
  if (view === "home") renderHome();
  if (view === "plans") renderPlans();
  if (view === "log") renderLog();
  if (view === "club") renderClub();
  window.scrollTo(0, 0);
}

/* used by the club screen when copying a shared plan */
async function addPlanCopy(p){
  const copy = { ...p, id: uid(), updatedAt: Date.now() };
  await savePlan(copy);
  S.plans.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
}

async function enterApp(){
  await loadAll();
  $("gate").hidden = true;
  $("app").hidden = false;
  $("topSub").textContent = S.mode === "cloud" ? "أهلاً " + S.user.name : "وضع محلي على هذا الجهاز";
  const a = $("btnAccount");
  if (S.user.photo){ a.style.backgroundImage = `url("${S.user.photo}")`; $("avatarText").textContent = ""; }
  else { a.style.backgroundImage = ""; $("avatarText").textContent = (S.user.name || "ض").trim().charAt(0); }
  show("home");
  socialBoot();
}

/* ---------- home ---------- */
function renderHome(){
  const st = streakInfo();
  $("streakNum").textContent = st.current;
  $("streakSub").textContent =
    st.current === 0 ? "ابدأ اليوم وخلّ العدّاد يمشي" :
    st.todayDone     ? "أنجزت تمرين اليوم — استمر" :
                       "درّب اليوم عشان ما تنكسر السلسلة";

  const names = ["ح","ن","ث","ر","خ","ج","س"];   // أحد إثنين ثلاثاء أربعاء خميس جمعة سبت
  let h = "";
  for (let i = 6; i >= 0; i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const on = st.days.has(dayKey(d));
    h += `<div class="day${on ? " on" : ""}${i === 0 ? " is-today" : ""}">`
       + `<i><svg viewBox="0 0 24 24"><path d="m5.5 12.5 4.2 4.2 8.8-9"/></svg></i>${names[d.getDay()]}</div>`;
  }
  $("week").innerHTML = h;

  const p = S.plans[0];
  if (p){
    $("quickName").textContent = p.name;
    $("quickMeta").textContent = `المدة ${mmss(planSeconds(p))} · ${planRounds(p)} جولة`;
    $("btnQuickStart").disabled = false;
  } else {
    $("quickName").textContent = "لا يوجد جدول";
    $("quickMeta").textContent = "أنشئ جدولك الأول من تبويب الجداول";
    $("btnQuickStart").disabled = true;
  }

  const done = S.sessions.filter(s => s.completed !== false);
  $("stAll").textContent = done.length;
  $("stBest").textContent = st.best;
  $("stMin").textContent = Math.round(S.sessions.reduce((a,s) => a + (s.secs||0), 0) / 60);
}

/* ---------- plans ---------- */
function renderPlans(){
  const ul = $("planList"); ul.innerHTML = "";
  S.plans.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML =
      `<button class="plan-go" aria-label="ابدأ التمرين"><svg class="ic"><use href="#i-play"/></svg></button>
       <div class="plan-main"><b></b><span>المدة ${mmss(planSeconds(p))} · ${planRounds(p)} جولة</span></div>
       <button class="plan-edit" aria-label="تعديل"><svg class="ic"><use href="#i-edit"/></svg></button>`;
    li.querySelector("b").textContent = p.name;
    li.querySelector(".plan-go").onclick = () => startRun(p);
    li.querySelector(".plan-main").onclick = () => startRun(p);
    li.querySelector(".plan-edit").onclick = () => openBuilder(p);
    ul.appendChild(li);
  });
}

/* ---------- builder ---------- */
function openBuilder(plan){
  S.editing = plan
    ? JSON.parse(JSON.stringify(plan))
    : { id: uid(), name:"", target:20, repeat:1, warm:180, cool:120, items:[] };
  $("buildTitle").textContent = plan ? "تعديل الجدول" : "جدول جديد";
  $("planName").value   = S.editing.name;
  $("planTarget").value = String(S.editing.target ?? 20);
  $("planRepeat").value = String(S.editing.repeat || 1);
  $("planWarm").value   = String(S.editing.warm ?? 0);
  $("planCool").value   = String(S.editing.cool ?? 0);
  $("btnBuildDelete").hidden = !plan || S.plans.length <= 1;
  renderPicker();
  renderBuild();
  show("build");
}

function renderPicker(){
  const box = $("picker"); box.innerHTML = "";
  LIB.forEach(e => {
    const b = document.createElement("button");
    b.innerHTML = `<span></span><small>${e.work}ث</small>`;
    b.querySelector("span").textContent = e.name;
    b.onclick = () => {
      S.editing.items.push({ key:e.key, name:e.name, work:e.work, rest:e.rest });
      renderBuild();
    };
    box.appendChild(b);
  });
}

function renderBuild(){
  const p = S.editing;
  const ul = $("buildList"); ul.innerHTML = "";
  $("buildEmpty").hidden = p.items.length > 0;
  $("itemCount").textContent = p.items.length ? `(${p.items.length})` : "";

  p.items.forEach((it, i) => {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="row-badge">${i+1}</span>
       <span class="row-name"></span>
       <span class="row-nums">
         <label>عمل<input type="number" min="5" max="600" step="5" class="in-work" value="${it.work}"></label>
         <label>راحة<input type="number" min="0" max="300" step="5" class="in-rest" value="${it.rest}"></label>
       </span>
       <span class="row-tools">
         <button class="up" aria-label="أعلى">▲</button>
         <button class="dn" aria-label="أسفل">▼</button>
         <button class="row-del del" aria-label="حذف">✕</button>
       </span>`;
    li.querySelector(".row-name").textContent = it.name;
    li.querySelector(".in-work").oninput = e => { it.work = Math.max(5, +e.target.value || 5); updateGauge(); };
    li.querySelector(".in-rest").oninput = e => { it.rest = Math.max(0, +e.target.value || 0); updateGauge(); };
    li.querySelector(".up").onclick = () => { if (i > 0){ [p.items[i-1], p.items[i]] = [p.items[i], p.items[i-1]]; renderBuild(); } };
    li.querySelector(".dn").onclick = () => { if (i < p.items.length-1){ [p.items[i+1], p.items[i]] = [p.items[i], p.items[i+1]]; renderBuild(); } };
    li.querySelector(".del").onclick = () => { p.items.splice(i, 1); renderBuild(); };
    ul.appendChild(li);
  });
  updateGauge();
}

function updateGauge(){
  const p = S.editing;
  p.repeat = +$("planRepeat").value;
  p.warm = +$("planWarm").value;
  p.cool = +$("planCool").value;
  p.target = +$("planTarget").value;

  const secs = planSeconds(p);
  const goal = p.target * 60;
  $("gaugeNow").textContent = mmss(secs);
  const g = $("gauge");
  if (!goal){
    $("gaugeFill").style.width = p.items.length ? "100%" : "0%";
    $("gaugeNote").textContent = p.items.length ? `${planRounds(p)} جولة — بدون مدة مستهدفة` : "أضف تمارين للجدول";
    g.classList.remove("over");
    return;
  }
  $("gaugeFill").style.width = Math.min(100, secs / goal * 100) + "%";
  const diff = secs - goal;
  g.classList.toggle("over", diff > 0);
  $("gaugeNote").textContent =
    !p.items.length ? "أضف تمارين للجدول" :
    Math.abs(diff) <= 20 ? `مطابق للمدة المستهدفة (${p.target} دقيقة)` :
    diff > 0 ? `أطول من المستهدف بـ ${mmss(diff)} دقيقة` :
               `ناقص ${mmss(-diff)} دقيقة عن المستهدف`;
}

async function saveBuilder(){
  const p = S.editing;
  p.name = $("planName").value.trim() || "جدول بدون اسم";
  updateGauge();
  if (!p.items.length){ toast("أضف تمريناً واحداً على الأقل"); return; }
  await savePlan(p);
  S.plans.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  toast("انحفظ الجدول");
  show("plans");
}

/* ============================================================
   RUNNER
   ============================================================ */
let ticker = null, wake = null;

function startRun(plan){
  const segs = buildSegments(plan);
  if (!segs.length){ toast("الجدول فاضي"); return; }
  S.run = {
    plan, segs, idx:0, elapsed:0, running:false, last:0, finished:false, beeped:-1,
    total: segs.reduce((a,s) => a + s.dur, 0),
    rounds: planRounds(plan)
  };
  drawTicks();
  renderRun();
  show("run");
}

function drawTicks(){
  const box = $("ticks"); box.innerHTML = "";
  const n = S.run.rounds;
  const rows = Math.ceil(n / 10);
  box.style.gridTemplateColumns = `repeat(${Math.ceil(n / rows)},1fr)`;
  for (let i = 1; i <= n; i++){
    const d = document.createElement("div");
    d.className = "tick"; d.textContent = i;
    box.appendChild(d);
  }
}

function currentRound(){
  const r = S.run; if (!r) return 0;
  for (let i = Math.min(r.idx, r.segs.length-1); i >= 0; i--)
    if (r.segs[i] && r.segs[i].round) return r.segs[i].round;
  return 0;
}
function doneBefore(i){
  const r = S.run; let t = 0;
  for (let j = 0; j < Math.min(i, r.segs.length); j++) t += r.segs[j].dur;
  return t;
}

function renderRun(){
  const r = S.run; if (!r) return;
  const seg = r.segs[Math.min(r.idx, r.segs.length-1)];
  const left = seg.dur - r.elapsed;

  $("runClock").textContent = r.finished ? "تم" : mmss(left);
  $("runPhase").textContent = r.finished ? "اكتمل التمرين" : seg.phase;
  $("runMove").textContent  = r.finished ? r.plan.name : seg.name;
  $("runTip").textContent   = r.finished ? "انحفظ في سجلك" : (r.running ? seg.tip : "متوقف");
  const nx = r.segs[r.idx+1];
  $("runNext").innerHTML = (!r.finished && nx) ? "بعده: <b>" + nx.name.replace(/</g,"&lt;") + "</b>" : "";

  document.body.classList.toggle("is-rest", !r.finished && seg.kind === "rest");
  document.body.classList.toggle("is-prep", !r.finished && seg.kind === "prep");

  const total = doneBefore(r.idx) + r.elapsed;
  const pct = Math.min(1, total / r.total);
  $("runLeft").textContent = `الجولة ${currentRound()} من ${r.rounds}`;
  $("runRight").textContent = `باقي ${mmss(r.total - total)} من ${mmss(r.total)}`;

  // climb the ridge
  const path = $("climbPath"), done = $("climbDone"), dot = $("climbDot");
  try {
    const L = path.getTotalLength();
    done.style.strokeDasharray = L;
    done.style.strokeDashoffset = L * (1 - pct);
    const pt = path.getPointAtLength(L * pct);
    dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
  } catch(e){}

  const cr = currentRound();
  [...$("ticks").children].forEach((el, i) => {
    const n = i + 1;
    el.classList.toggle("past", r.finished || n < cr || (n === cr && seg.kind === "rest"));
    el.classList.toggle("now", !r.finished && n === cr && seg.kind === "work");
  });

  const label = r.finished ? "من جديد" : (r.running ? "إيقاف" : (total > 0 ? "أكمل" : "ابدأ"));
  const icon  = r.running ? "i-pause" : "i-play";
  $("btnPrimary").innerHTML = `<svg class="ic"><use href="#${icon}"/></svg><span>${label}</span>`;
}

/* sound */
let actx = null;
function beep(freq, ms, vol){
  if (!$("optSound").checked) return;
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    if (!actx) actx = new C();
    if (actx.state === "suspended") actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + ms/1000);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + ms/1000);
  } catch(e){}
}

function keepAwake(on){
  try {
    if (on && navigator.wakeLock && !wake){
      navigator.wakeLock.request("screen").then(s => {
        wake = s; s.addEventListener("release", () => { wake = null; });
      }).catch(() => {});
    } else if (!on && wake){ wake.release().catch(() => {}); wake = null; }
  } catch(e){}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.run && S.run.running) keepAwake(true);
});

function tick(){
  const r = S.run; if (!r || !r.running) return;
  const now = Date.now();
  r.elapsed += (now - r.last) / 1000; r.last = now;

  const whole = Math.ceil(r.segs[r.idx].dur - r.elapsed);
  if (whole <= 3 && whole > 0 && whole !== r.beeped){ r.beeped = whole; beep(760, 110, .18); }

  while (r.idx < r.segs.length && r.elapsed >= r.segs[r.idx].dur){
    r.elapsed -= r.segs[r.idx].dur; r.idx++; r.beeped = -1;
    if (r.idx >= r.segs.length){ finishRun(true); return; }
    beep(r.segs[r.idx].kind === "rest" ? 430 : 980, 260, .3);
  }
  renderRun();
}

function play(){
  const r = S.run; if (!r) return;
  if (r.finished){ startRun(r.plan); return; }
  r.running = true; r.last = Date.now();
  beep(980, 200, .28); keepAwake(true);
  if (!ticker) ticker = setInterval(tick, 120);
  renderRun();
}
function pause(){ if (S.run){ S.run.running = false; } keepAwake(false); renderRun(); }
function stopTimer(){ if (ticker){ clearInterval(ticker); ticker = null; } keepAwake(false); }

async function finishRun(complete){
  const r = S.run; if (!r) return;
  r.running = false; stopTimer();
  const rounds = complete ? r.rounds : currentRound();
  const secs = complete ? r.total : doneBefore(r.idx) + r.elapsed;

  if (rounds > 0){
    const sess = {
      id: uid(), at: Date.now(), planId: r.plan.id, planName: r.plan.name,
      rounds, total: r.rounds, secs: Math.round(secs), completed: !!complete
    };
    await saveSession(sess);
    socialAfterWorkout(sess);
  }
  if (complete){
    r.finished = true;
    beep(880, 300, .3); setTimeout(() => beep(1180, 420, .3), 320);
    const st = streakInfo();
    renderRun();
    toast(st.current > 1 ? `ممتاز — ${st.current} أيام متتالية` : "أحسنت، انحفظ التمرين");
  } else {
    S.run = null;
    show("home");
    if (rounds > 0) toast(`انحفظ ${rounds} من ${r.rounds} جولة`);
  }
}

/* ---------- log ---------- */
function renderLog(){
  const ul = $("log"); ul.innerHTML = "";
  $("logEmpty").hidden = S.sessions.length > 0;
  ul.hidden = S.sessions.length === 0;
  $("logCount").textContent = S.sessions.length ? `${S.sessions.length} تمرين` : "";

  S.sessions.forEach(s => {
    const d = new Date(s.at);
    const date = d.toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { weekday:"long", day:"numeric", month:"long" });
    const time = d.toLocaleTimeString("ar-SA-u-nu-latn", { hour:"numeric", minute:"2-digit" });
    const li = document.createElement("li");
    if (s.completed === false) li.className = "partial";
    li.innerHTML =
      `<span class="log-ic"><svg class="ic"><use href="#i-${s.completed === false ? "timer" : "check"}"/></svg></span>
       <span class="log-main"><b></b><span>${date} · ${time} · ${s.rounds}/${s.total || s.rounds} جولة · ${mmss(s.secs)}</span></span>
       <button class="log-del" aria-label="احذف هذا التمرين"><svg class="ic"><use href="#i-trash"/></svg></button>`;
    li.querySelector("b").textContent = s.planName || "تمرين";
    li.querySelector(".log-del").onclick = async () => {
      const ok = await ask("حذف التمرين", `${s.planName || "تمرين"} — ${date}. الحذف يؤثر على عدّاد الأيام المتتالية.`);
      if (!ok) return;
      await deleteSession(s.id);
      renderLog();
      toast("انحذف التمرين من السجل");
    };
    ul.appendChild(li);
  });
}

/* ============================================================
   WIRING
   ============================================================ */
$("btnGoogle").onclick = signInGoogle;
$("btnGuest").onclick  = goGuest;

document.querySelectorAll(".tabbar button").forEach(b => {
  b.onclick = () => { if (S.run && S.run.running) pause(); show(b.dataset.view); };
});

$("btnQuickStart").onclick = () => { if (S.plans[0]) startRun(S.plans[0]); };
$("btnNewPlan").onclick    = () => openBuilder(null);
$("btnBuildCancel").onclick = () => show("plans");
$("btnBuildSave").onclick   = saveBuilder;
$("btnBuildDelete").onclick = async () => {
  const ok = await ask("حذف الجدول", `${S.editing.name || "هذا الجدول"} — ما راح يظهر في قائمة الجداول.`);
  if (!ok) return;
  await removePlan(S.editing.id);
  toast("انحذف الجدول");
  show("plans");
};
["planRepeat","planWarm","planCool","planTarget"].forEach(id => { $(id).onchange = updateGauge; });
$("btnCustomAdd").onclick = () => {
  const v = $("customName").value.trim();
  if (!v) return;
  S.editing.items.push({ key:"X", name:v, work:45, rest:15 });
  $("customName").value = "";
  renderBuild();
};
$("customName").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); $("btnCustomAdd").click(); } });

$("btnPrimary").onclick = () => { if (!S.run) return; S.run.running ? pause() : play(); };
$("btnSkip").onclick = () => {
  const r = S.run; if (!r || r.finished) return;
  r.elapsed = 0; r.beeped = -1; r.idx++;
  if (r.idx >= r.segs.length){ r.idx = r.segs.length - 1; finishRun(true); return; }
  renderRun();
};
$("btnStop").onclick = async () => {
  if (!S.run) return;
  if (S.run.finished){ S.run = null; show("home"); return; }
  const ok = await ask("إنهاء التمرين", "اللي أنجزته ينحفظ في السجل.", "أنهِ التمرين");
  if (!ok) return;
  finishRun(false);
};

$("btnAccount").onclick = () => {
  $("sheetName").textContent = S.user.name;
  $("sheetMail").textContent = S.user.email || "بدون بريد";
  const mid = memberId();
  $("sheetSync").textContent = S.mode === "cloud"
    ? (mid ? `رقم عضويتك ${mid} — بياناتك تتزامن بين أجهزتك.`
           : "بياناتك محفوظة في حسابك وتتزامن بين أجهزتك.")
    : "وضع محلي — البيانات على هذا الجهاز فقط. سجّل بجوجل للمزامنة.";
  $("btnSignOut").textContent = S.mode === "cloud" ? "تسجيل الخروج" : "رجوع لشاشة الدخول";
  $("sheet").hidden = false;
};
$("btnCloseSheet").onclick = () => { $("sheet").hidden = true; };
$("btnSignOut").onclick = signOutNow;
$("sheet").addEventListener("click", e => { if (e.target.id === "sheet") $("sheet").hidden = true; });
$("confirm").addEventListener("click", e => { if (e.target.id === "confirm") $("cfNo").click(); });

/* ---------- boot ---------- */
initSocial({
  S, toast, ask, dayKey, streakInfo, show,
  planRounds, planSeconds, addPlanCopy
});

(async function boot(){
  if (!hasConfig()) $("btnGoogle").disabled = false;   // still clickable, shows a helpful note
  watchAuth();
  if (lsGet(LK.mode, "") === "local") await goGuest();
})();
