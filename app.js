/* ============================================================
   نادي الجبال — app logic
   - Google sign-in + per-user Firestore database (users/{uid}/…)
   - Local fallback so the app works offline / before Firebase setup
   ============================================================ */

import { initSocial, socialBoot, socialTeardown, socialAfterWorkout,
         renderClub, refreshClub, memberId,
         publishMyPlan, unpublishMyPlan } from "./social.js";
import { initProgress, renderProgress, badgeCount } from "./progress.js";
import { L, LOC, SPEECH, lang, setLang, translateStatic } from "./i18n.js";
import { shareCard } from "./share.js";
import { initPush, renderPush, wirePush } from "./push.js";
import { SHOTS } from "./ex.js";

translateStatic();

/* ---------------- exercise library ---------------- */
const LIB = [
  { key:"N", name:L("نط الحبل"),        work:60, rest:0,  tip:L("إيقاع ثابت، الكتفين مرتخية") },
  { key:"P", name:L("بوش اب"),          work:45, rest:15, tip:L("الجسم خط مستقيم من الكعب للرأس") },
  { key:"S", name:L("ضغط أكتاف"),       work:45, rest:15, tip:L("شدّ البطن ولا تقوّس ظهرك") },
  { key:"B", name:L("بلانك"),           work:45, rest:15, tip:L("ثبّت الحوض، لا ترفع ردفك") },
  { key:"Q", name:L("سكوات"),           work:45, rest:15, tip:L("الكعب ثابت على الأرض") },
  { key:"L", name:L("لانجز"),           work:45, rest:15, tip:L("الركبة الأمامية فوق الكاحل") },
  { key:"M", name:L("متسلق الجبل"),     work:40, rest:20, tip:L("الحوض منخفض والإيقاع سريع") },
  { key:"U", name:L("بيربي"),           work:40, rest:20, tip:L("نزول ودفع وقفزة — نفس منتظم") },
  { key:"C", name:L("تمارين البطن"),    work:45, rest:15, tip:L("ارفع بالبطن لا بالرقبة") },
  { key:"H", name:L("جسر الورك"),       work:45, rest:15, tip:L("اعصر المؤخرة في الأعلى") },
  { key:"J", name:L("قفز الفتح والضم"), work:45, rest:15, tip:L("نزول خفيف على مشط القدم") },
  { key:"T", name:L("تمديد الظهر"),     work:40, rest:20, tip:L("ارفع الصدر ببطء") }
];

/* ---------------- تمارين بأوزان (مجموعات × عدّات × كجم) ---------------- */
const WLIB = [
  { key:"WB", name:L("بنش برس"),         sets:3, reps:10, weight:20, rest:75, tip:L("نزّل للصدر ببطء وادفع بثبات") },
  { key:"WQ", name:L("سكوات بار"),       sets:4, reps:10, weight:30, rest:90, tip:L("الظهر مستقيم والكعب ثابت") },
  { key:"WD", name:L("ديدليفت"),         sets:3, reps:8,  weight:40, rest:90, tip:L("ارفع بالورك والظهر محايد") },
  { key:"WT", name:L("سحب أمامي"),       sets:3, reps:10, weight:25, rest:75, tip:L("اسحب للصدر واعصر اللوح") },
  { key:"WR", name:L("تجديف بالدمبل"),   sets:3, reps:12, weight:12, rest:60, tip:L("اسحب للخصر والمرفق قريب") },
  { key:"WS", name:L("ضغط أكتاف دمبل"),  sets:3, reps:10, weight:10, rest:60, tip:L("شدّ البطن ولا تقوّس ظهرك") },
  { key:"WL", name:L("رفرفة جانبي"),     sets:3, reps:14, weight:6,  rest:45, tip:L("ارفع لمستوى الكتف فقط") },
  { key:"WC", name:L("بايسبس بار"),      sets:3, reps:12, weight:15, rest:60, tip:L("المرفق ثابت بجنبك") },
  { key:"WX", name:L("ترايسبس كيبل"),    sets:3, reps:12, weight:15, rest:60, tip:L("مدّ الذراع كاملاً") },
  { key:"WG", name:L("دفع أرجل"),        sets:3, reps:12, weight:50, rest:75, tip:L("لا تقفل الركبة في الأعلى") },
  { key:"WH", name:L("مرجحة كيتل بيل"),  sets:3, reps:15, weight:16, rest:60, tip:L("الدفع من الورك لا من الذراع") },
  { key:"WF", name:L("سمانة واقف"),      sets:3, reps:15, weight:20, rest:45, tip:L("ارتفاع كامل وثبات ثانية") }
];
const REP_SEC = 3.5;                              // تقدير زمن العدّة الواحدة
const byKey = k => LIB.find(e => e.key === k) || WLIB.find(e => e.key === k);
const isReps = it => it && it.mode === "reps";
const estWork = it => isReps(it)
  ? Math.round(Math.max(1,+it.sets||1) * Math.max(1,+it.reps||1) * REP_SEC)
  : (+it.work||0);
const estRest = it => isReps(it) ? (+it.rest||0) * Math.max(1,+it.sets||1) : (+it.rest||0);
const itemVolume = it => isReps(it)
  ? Math.max(1,+it.sets||1) * Math.max(1,+it.reps||1) * (+it.weight||0) : 0;

/* ---------------- default plan ---------------- */
const DEFAULT_SEQ = ["N","P","N","S","N","B","N","P","N","Q","N","S","N","B","N","P","N","Q","N","B"];
function defaultPlan(){
  return {
    id: "abdulelah-default",
    name: L("جدول عبدالاله الرياضي"),
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
  fb: null,              // {auth, db, mods}
  freeze: { credits: 0, used: {}, earnedUpto: 0 },  // تجميد السلسلة
  week: ["","","","","","",""],                    // خطة الأسبوع: "" بدون · "rest" راحة · معرّف جدول
  body: []                                         // قياسات الجسم
};

const $ = id => document.getElementById(id);
const pad = n => (n < 10 ? "0" : "") + n;
const mmss = s => { s = Math.max(0, Math.ceil(s - 0.001)); return Math.floor(s/60) + ":" + pad(s%60); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dayKey = d => { const x = new Date(d); return x.getFullYear()+"-"+pad(x.getMonth()+1)+"-"+pad(x.getDate()); };

/* custom confirm sheet — avoids the browser's own dialog */
function ask(title, text, yes = L("نعم، احذف")){
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
  const one = p.items.reduce((a,i) => a + estWork(i) + estRest(i), 0);
  const reps = Math.max(1, +p.repeat || 1);
  const lastRest = p.items.length ? (+p.items[p.items.length-1].rest || 0) : 0;
  return (+p.warm||0) + one*reps - lastRest + (+p.cool||0);
}
function planRounds(p){ return p.items.length * Math.max(1, +p.repeat || 1); }

function buildSegments(p){
  const segs = [];
  const reps = Math.max(1, +p.repeat || 1);
  const total = planRounds(p);
  if (+p.warm > 0) segs.push({ kind:"prep", phase:L("إحماء"), name:L("إحماء وتدوير مفاصل"), dur:+p.warm, tip:L("ارفع نبضك بالتدريج") });
  let r = 0;
  for (let rep = 0; rep < reps; rep++){
    p.items.forEach((it, i) => {
      r++;
      const src = byKey(it.key);
      const tip = src ? src.tip : L("ركّز على الأداء الصحيح");
      const lastItem = (rep === reps-1) && (i === p.items.length-1);

      if (isReps(it)){
        const sets = Math.max(1, +it.sets||1);
        for (let s = 1; s <= sets; s++){
          segs.push({ kind:"reps", phase:L("الجولة {0} من {1}", r, total), name:L(it.name), key:it.key,
                      dur: Math.round(Math.max(1,+it.reps||1) * REP_SEC), open:true, round:r,
                      set:s, sets, reps:Math.max(1,+it.reps||1), weight:+it.weight||0, item:it, tip });
          if ((+it.rest||0) > 0 && !(lastItem && s === sets))
            segs.push({ kind:"rest", phase:L("راحة"), name:L("استعد"), dur:+it.rest, tip:L("تنفّس عميق"), round:r });
        }
        return;
      }

      segs.push({ kind:"work", phase:L("الجولة {0} من {1}", r, total), name:L(it.name), key:it.key,
                  dur:+it.work||30, tip, round:r });
      if ((+it.rest||0) > 0 && !lastItem)
        segs.push({ kind:"rest", phase:L("راحة"), name:L("استعد"), dur:+it.rest, tip:L("تنفّس عميق"), round:r });
    });
  }
  if (+p.cool > 0) segs.push({ kind:"prep", phase:L("تهدئة"), name:L("إطالة"), dur:+p.cool, tip:L("أطل كل عضلة ٢٠ ثانية") });
  return segs;
}

/* ============================================================
   STORAGE — local always; cloud when signed in
   ============================================================ */
const LK = { plans:"hejaz.plans", sessions:"hejaz.sessions", mode:"hejaz.mode", freeze:"hejaz.freeze", week:"hejaz.week", body:"hejaz.body" };

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
      toast(L("تعذّر تحميل بياناتك من السحابة"));
      S.plans = lsGet(LK.plans, []); S.sessions = lsGet(LK.sessions, []);
    }
  } else {
    S.plans = lsGet(LK.plans, []);
    S.sessions = lsGet(LK.sessions, []);
  }
  /* تجميد السلسلة */
  S.freeze = lsGet(LK.freeze, { credits:0, used:{}, earnedUpto:0 });
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try {
      const snap = await m.getDoc(m.doc(db, "users", S.user.uid, "meta", "freeze"));
      if (snap.exists()) S.freeze = { credits:0, used:{}, earnedUpto:0, ...snap.data() };
    } catch(err){ console.error("freeze", err); }
  }

  /* خطة الأسبوع */
  S.week = lsGet(LK.week, ["","","","","","",""]);
  if (!Array.isArray(S.week) || S.week.length !== 7) S.week = ["","","","","","",""];
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try {
      const snap = await m.getDoc(m.doc(db, "users", S.user.uid, "meta", "week"));
      if (snap.exists() && Array.isArray(snap.data().days)) S.week = snap.data().days;
    } catch(err){ console.error("week", err); }
  }

  /* قياسات الجسم */
  S.body = lsGet(LK.body, []);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try {
      const snap = await m.getDocs(m.query(m.collection(db, "users", S.user.uid, "body"),
                                           m.orderBy("at","desc"), m.limit(200)));
      S.body = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    } catch(err){ console.error("body", err); }
  }
  S.body.sort((a,b) => b.at - a.at);

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
    catch(err){ console.error(err); toast(L("انحفظ محلياً — تعذّر الحفظ في السحابة")); }
    publishMyPlan(p);          // نسخة معروضة لأصدقائي
  }
}

async function removePlan(id){
  S.plans = S.plans.filter(p => p.id !== id);
  lsSet(LK.plans, S.plans);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "plans", id)); } catch(err){ console.error(err); }
    unpublishMyPlan(id);
  }
}

async function deleteSession(id){
  S.sessions = S.sessions.filter(s => s.id !== id);
  lsSet(LK.sessions, S.sessions);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "sessions", id)); }
    catch(err){ console.error(err); toast(L("انحذف محلياً — تعذّر الحذف من السحابة")); }
  }
}

async function updateSession(sess){
  const i = S.sessions.findIndex(s => s.id === sess.id);
  if (i < 0) return;
  S.sessions[i] = sess;
  S.sessions.sort((a, b) => b.at - a.at);
  lsSet(LK.sessions, S.sessions);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "sessions", sess.id), sess); }
    catch(err){ console.error(err); toast(L("انحفظ محلياً — تعذّر الحفظ في السحابة")); }
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
    $("gateNote").textContent = L("إعدادات Firebase غير مكتملة — افتح ملف firebase-config.js والصق بيانات مشروعك.");
    return;
  }
  $("gateNote").textContent = L("جارٍ فتح نافذة جوجل…");
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
    $("gateNote").textContent = L("تعذّر تسجيل الدخول: ") + (err.code || err.message);
  }
}

/* ---------------- الدخول بالبريد وكلمة السر ---------------- */
let authMode = "in";          // "in" دخول | "up" حساب جديد
let pendingName = "";         // الاسم وقت إنشاء الحساب قبل ما يحفظه فايربيس

function authError(err){
  const c = (err && err.code) || "";
  const map = {
    "auth/invalid-email":          L("البريد الإلكتروني غير صحيح"),
    "auth/missing-email":          L("اكتب بريدك الإلكتروني"),
    "auth/user-not-found":         L("ما فيه حساب بهذا البريد — أنشئ حساباً جديداً"),
    "auth/wrong-password":         L("كلمة السر غير صحيحة"),
    "auth/invalid-credential":     L("البريد أو كلمة السر غير صحيحة"),
    "auth/invalid-login-credentials": L("البريد أو كلمة السر غير صحيحة"),
    "auth/email-already-in-use":   L("هذا البريد مسجّل — سجّل دخولك بدل إنشاء حساب"),
    "auth/weak-password":          L("كلمة السر قصيرة — ٦ أحرف على الأقل"),
    "auth/too-many-requests":      L("محاولات كثيرة — انتظر شوي وجرّب مرة ثانية"),
    "auth/network-request-failed": L("ما فيه اتصال بالإنترنت"),
    "auth/operation-not-allowed":  L("الدخول بالبريد غير مفعّل في Firebase — فعّله من Authentication ثم Sign-in method")
  };
  return map[c] || (L("تعذّر تسجيل الدخول: ") + (c || err.message || ""));
}

function setAuthMode(mode){
  authMode = mode;
  const up = mode === "up";
  $("fldName").hidden = !up;
  $("btnMailGo").textContent = up ? L("أنشئ الحساب") : L("دخول");
  $("btnAuthMode").textContent = up ? L("عندك حساب؟ سجّل دخولك") : L("ما عندك حساب؟ أنشئ حساب");
  $("auPass").setAttribute("autocomplete", up ? "new-password" : "current-password");
  $("gateNote").textContent = "";
}

async function mailSubmit(e){
  if (e) e.preventDefault();
  if (!hasConfig()){
    $("gateNote").textContent = L("إعدادات Firebase غير مكتملة — افتح ملف firebase-config.js والصق بيانات مشروعك.");
    return;
  }
  const mail = $("auMail").value.trim();
  const pass = $("auPass").value;
  const name = $("auName").value.trim();
  if (!mail){ $("gateNote").textContent = L("اكتب بريدك الإلكتروني"); return; }
  if (pass.length < 6){ $("gateNote").textContent = L("كلمة السر قصيرة — ٦ أحرف على الأقل"); return; }

  $("btnMailGo").disabled = true;
  $("gateNote").textContent = L("لحظة…");
  try {
    const { auth, authM } = await initFirebase();
    if (authMode === "up"){
      pendingName = name;
      const cred = await authM.createUserWithEmailAndPassword(auth, mail, pass);
      if (name){ try { await authM.updateProfile(cred.user, { displayName: name }); } catch(err){} }
    } else {
      await authM.signInWithEmailAndPassword(auth, mail, pass);
    }
    $("auPass").value = "";
  } catch(err){
    console.error(err);
    $("gateNote").textContent = authError(err);
  } finally {
    $("btnMailGo").disabled = false;
  }
}

async function forgotPass(){
  const mail = $("auMail").value.trim();
  if (!mail){ $("gateNote").textContent = L("اكتب بريدك الإلكتروني أولاً ثم اضغط «نسيت كلمة السر»"); return; }
  try {
    const { auth, authM } = await initFirebase();
    await authM.sendPasswordResetEmail(auth, mail);
    $("gateNote").textContent = L("أرسلنا رابط تغيير كلمة السر على بريدك");
  } catch(err){
    console.error(err);
    $("gateNote").textContent = authError(err);
  }
}

async function watchAuth(){
  if (!hasConfig()){
    $("gateNote").textContent = L("لتفعيل المزامنة بين أجهزتك: أنشئ مشروع Firebase والصق بياناته في firebase-config.js");
    return;
  }
  try {
    const { auth, authM } = await initFirebase();
    authM.getRedirectResult(auth).catch(() => {});
    authM.onAuthStateChanged(auth, async (u) => {
      if (u){
        S.mode = "cloud";
        S.user = { uid:u.uid, name:u.displayName || pendingName || L("صديق الجبال"), email:u.email || "", photo:u.photoURL || "" };
        pendingName = "";
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
    $("gateNote").textContent = L("تعذّر تحميل Firebase — تأكد من الاتصال بالإنترنت.");
  }
}

async function goGuest(){
  S.mode = "local";
  S.user = { uid:"local", name:L("ضيف"), email:"", photo:"" };
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
  resetMailForm();
}

/* يرجّع نموذج البريد لحالته الأولى */
function resetMailForm(){
  const f = $("mailForm"); if (!f) return;
  f.hidden = true;
  $("btnMailToggle").hidden = false;
  $("auMail").value = ""; $("auPass").value = ""; $("auName").value = "";
  setAuthMode("in");
}

/* ============================================================
   STREAK + تجميد السلسلة
   ============================================================ */
const trainedDays = () =>
  new Set(S.sessions.filter(s => s.completed !== false).map(s => dayKey(s.at)));

async function saveFreeze(){
  lsSet(LK.freeze, S.freeze);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "meta", "freeze"), S.freeze); }
    catch(err){ console.error("saveFreeze", err); }
  }
}

async function saveWeek(){
  lsSet(LK.week, S.week);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "meta", "week"), { days: S.week }); }
    catch(err){ console.error("saveWeek", err); }
  }
}

/* ---------------- قياسات الجسم ---------------- */
async function saveBody(entry){
  S.body.unshift(entry);
  S.body.sort((a,b) => b.at - a.at);
  lsSet(LK.body, S.body);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "body", entry.id), entry); }
    catch(err){ console.error("saveBody", err); }
  }
}
async function delBody(id){
  const row = S.body.find(b => b.id === id);
  const ok = await ask(L("حذف القياس"), L("سينحذف قياس {0}.",
    new Date(row ? row.at : Date.now()).toLocaleDateString(LOC(), { day:"numeric", month:"long" })));
  if (!ok) return;
  S.body = S.body.filter(b => b.id !== id);
  lsSet(LK.body, S.body);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "body", id)); } catch(err){ console.error(err); }
  }
  renderProgress();
  toast(L("انحذف القياس"));
}
function openBody(){
  const last = S.body[0] || {};
  $("bdW").value = last.weight || "";
  $("bdWaist").value = last.waist || "";
  $("bdChest").value = last.chest || "";
  $("bdArm").value = last.arm || "";
  $("bodySheet").hidden = false;
  setTimeout(() => $("bdW").focus(), 60);
}
async function submitBody(){
  const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) && n > 0 ? Math.round(n*10)/10 : 0; };
  const e = {
    id: uid(), at: Date.now(),
    weight: num($("bdW").value), waist: num($("bdWaist").value),
    chest:  num($("bdChest").value), arm: num($("bdArm").value)
  };
  if (!e.weight && !e.waist && !e.chest && !e.arm){ toast(L("اكتب قياساً واحداً على الأقل")); return; }
  $("bodySheet").hidden = true;
  await saveBody(e);
  renderProgress();
  toast(L("انحفظ القياس"));
}

/* جدول اليوم حسب خطة الأسبوع */
function todaySlot(){
  const slot = S.week[new Date().getDay()] || "";
  if (slot === "rest") return { rest: true, plan: S.plans[0] || null, planned: true };
  const p = slot ? S.plans.find(x => x.id === slot) : null;
  return { rest: false, plan: p || S.plans[0] || null, planned: !!p };
}

/* يغطّي يوماً واحداً فائتاً بين يومي تدريب — يوم راحة بدون ما تنكسر السلسلة */
function applyFreezes(){
  const days = trainedDays(), f = S.freeze;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayK = dayKey(today);
  let used = 0;
  const d = new Date(today); d.setDate(d.getDate() - 1);   // نبدأ من أمس

  for (let guard = 0; guard < 400; guard++){
    const k = dayKey(d);
    if (days.has(k) || f.used[k]){ d.setDate(d.getDate() - 1); continue; }

    const prevK = dayKey(new Date(d.getTime() - 86400000));
    const nextK = dayKey(new Date(d.getTime() + 86400000));
    const alive = days.has(prevK) || f.used[prevK];
    const after = days.has(nextK) || f.used[nextK] || nextK === todayK;

    if (f.credits > 0 && alive && after){
      f.credits--; f.used[k] = true; used++;
      d.setDate(d.getDate() - 1); continue;
    }
    break;                                    // هنا تنتهي السلسلة فعلاً
  }
  return used;
}

/* تكسب تجميداً عن كل ٧ أيام متتالية، بحد أقصى ٣ */
function awardFreezes(streak){
  const f = S.freeze;
  const milestone = Math.floor(streak / 7);
  if (milestone > (f.earnedUpto || 0)){
    const gained = Math.min(3 - f.credits, milestone - f.earnedUpto);
    f.earnedUpto = milestone;
    if (gained > 0){ f.credits += gained; return gained; }
  }
  return 0;
}

function streakInfo(){
  const days = trainedDays();
  const frozen = new Set(Object.keys(S.freeze.used || {}));
  const all = new Set([...days, ...frozen]);
  const today = new Date(); today.setHours(0,0,0,0);

  let cur = 0;
  const probe = new Date(today);
  if (!all.has(dayKey(probe))) probe.setDate(probe.getDate() - 1);   // أمس يبقيها حيّة
  while (all.has(dayKey(probe))){ cur++; probe.setDate(probe.getDate() - 1); }

  let best = 0, run = 0, prev = null;
  [...all].sort().forEach(k => {
    const d = new Date(k + "T00:00:00");
    run = (prev && (d - prev) === 86400000) ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  });
  return { current: cur, best, days, frozen, all, todayDone: days.has(dayKey(today)) };
}

/* تُستدعى عند الإقلاع وبعد كل تمرين */
async function refreshStreak(){
  const usedNow = applyFreezes();
  const gained = awardFreezes(streakInfo().current);
  if (usedNow || gained) await saveFreeze();
  if (usedNow) toast(usedNow === 1 ? L("استخدمنا تجميداً — سلسلتك محفوظة ❄️")
                                   : L("استخدمنا {0} تجميدات — سلسلتك محفوظة ❄️", usedNow));
  else if (gained) toast(L("كسبت {0} ❄️", gained === 1 ? L("تجميد") : gained + L(" تجميدات")));
}

/* ============================================================
   VIEWS
   ============================================================ */
function show(view){
  ["home","plans","build","log","run","club","group","friend","dm"].forEach(v => {
    const el = $("v-" + v); if (el) el.hidden = (v !== view);
  });
  const clubish = ["group","friend","dm"].includes(view);
  document.querySelectorAll(".tabbar button").forEach(b =>
    b.classList.toggle("on", b.dataset.view === view || (clubish && b.dataset.view === "club")));
  if (view === "home") renderHome();
  if (view === "plans") renderPlans();
  if (view === "log"){ renderProgress(); renderLog(); }
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
  $("topSub").textContent = S.mode === "cloud" ? L("أهلاً ") + S.user.name : L("وضع محلي على هذا الجهاز");
  const a = $("btnAccount");
  if (S.user.photo){ a.style.backgroundImage = `url("${S.user.photo}")`; $("avatarText").textContent = ""; }
  else { a.style.backgroundImage = ""; $("avatarText").textContent = (S.user.name || L("ض")).trim().charAt(0); }
  await refreshStreak();
  show("home");
  socialBoot();
  offerPlan();
}

/* ---------- home ---------- */
function renderHome(){
  const st = streakInfo();
  $("streakNum").textContent = st.current;
  $("streakSub").textContent =
    st.current === 0 ? L("ابدأ اليوم وخلّ العدّاد يمشي") :
    st.todayDone     ? L("أنجزت تمرين اليوم — استمر") :
                       L("درّب اليوم عشان ما تنكسر السلسلة");

  const names = [L("ح"),L("ن"),L("ث"),L("ر"),L("خ"),L("ج"),L("س")];   // أحد إثنين ثلاثاء أربعاء خميس جمعة سبت
  let h = "";
  for (let i = 6; i >= 0; i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const on = st.days.has(dayKey(d));
    const froze = st.frozen.has(dayKey(d));
    h += `<div class="day${on ? " on" : froze ? " froze" : ""}${i === 0 ? " is-today" : ""}">`
       + `<i>${froze ? "❄️" : `<svg viewBox="0 0 24 24"><path d="m5.5 12.5 4.2 4.2 8.8-9"/></svg>`}</i>`
       + `${names[d.getDay()]}</div>`;
  }
  $("week").innerHTML = h;
  $("freezeChip").innerHTML = S.freeze.credits
    ? `❄️ ${S.freeze.credits} ${S.freeze.credits === 1 ? L("تجميد") : L("تجميدات")}`
    : L("❄️ تكسب تجميداً كل ٧ أيام");

  const slot = todaySlot();
  const p = slot.plan;
  const eb = $("quickEyebrow"), btn = $("btnQuickStart");
  const btnLabel = t => { const sp = btn.querySelector("span"); if (sp) sp.textContent = t; };
  if (!p){
    eb.textContent = L("تمرين اليوم");
    $("quickName").textContent = L("لا يوجد جدول");
    $("quickMeta").textContent = L("أنشئ جدولك الأول من تبويب الجداول");
    btn.disabled = true;
  } else if (slot.rest){
    eb.textContent = L("خطة الأسبوع");
    $("quickName").textContent = L("اليوم راحة");
    $("quickMeta").textContent = L("خطتك تقول ترتاح اليوم — الراحة جزء من التقدّم");
    btnLabel(L("درّب على أي حال"));
    btn.disabled = false;
  } else {
    eb.textContent = slot.planned ? L("تمرين اليوم حسب خطتك") : L("تمرين اليوم");
    $("quickName").textContent = L(p.name);
    $("quickMeta").textContent = L("المدة {0} · {1} جولة", mmss(planSeconds(p)), planRounds(p));
    btnLabel(L("ابدأ التمرين"));
    btn.disabled = false;
  }

  const done = S.sessions.filter(s => s.completed !== false);
  $("stAll").textContent = done.length;
  $("stBest").textContent = st.best;
  $("stMin").textContent = Math.round(S.sessions.reduce((a,s) => a + (s.secs||0), 0) / 60);
}

/* ---------- قائمة اختيار عامة ---------- */
function pickOne(title, options){
  return new Promise(resolve => {
    $("pkTitle").textContent = title;
    const box = $("pkList"); box.innerHTML = "";
    options.forEach(o => {
      const b = document.createElement("button");
      b.className = "pick-item" + (o.on ? " on" : "");
      b.innerHTML = `<b></b>${o.sub ? "<span></span>" : ""}`;
      b.querySelector("b").textContent = o.label;
      if (o.sub) b.querySelector("span").textContent = o.sub;
      b.onclick = () => done(o.value);
      box.appendChild(b);
    });
    const done = v => {
      $("pick").hidden = true;
      $("pkNo").onclick = null;
      $("pick").onclick = null;
      resolve(v);
    };
    $("pkNo").onclick = () => done(null);
    $("pick").onclick = e => { if (e.target.id === "pick") done(null); };
    $("pick").hidden = false;
  });
}

/* ---------- خطة الأسبوع ---------- */
const DAY_SHORT = ["ح","ن","ث","ر","خ","ج","س"];
const DAY_LONG  = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function renderWeekPlan(){
  const box = $("wpDays"); if (!box) return;
  box.innerHTML = "";
  const today = new Date().getDay();
  let set = 0;
  S.week.forEach((slot, i) => {
    if (slot) set++;
    const p = slot && slot !== "rest" ? S.plans.find(x => x.id === slot) : null;
    const el = document.createElement("button");
    el.className = "wp-day" + (i === today ? " is-today" : "") +
      (slot === "rest" ? " rest" : p ? " has" : "");
    el.innerHTML = `<i>${L(DAY_SHORT[i])}</i><span></span>`;
    el.querySelector("span").textContent =
      slot === "rest" ? L("راحة") : p ? L(p.name) : L("—");
    el.onclick = () => editWeekDay(i);
    box.appendChild(el);
  });
  $("wpNote").textContent = set
    ? L("{0} من 7 أيام محددة", set)
    : L("اضغط أي يوم وحدد جدوله");
}

async function editWeekDay(i){
  const cur = S.week[i] || "";
  const opts = [
    { label: L("بدون تحديد"), value: "", on: cur === "" },
    { label: L("يوم راحة"),   value: "rest", on: cur === "rest" },
    ...S.plans.map(p => ({
      label: L(p.name), value: p.id, on: cur === p.id,
      sub: L("المدة {0} · {1} جولة", mmss(planSeconds(p)), planRounds(p))
    }))
  ];
  const v = await pickOne(L(DAY_LONG[i]), opts);
  if (v === null) return;
  S.week[i] = v;
  await saveWeek();
  renderWeekPlan();
  toast(L("انحفظت خطة الأسبوع"));
}

/* ---------- plans ---------- */
function renderPlans(){
  renderWeekPlan();
  const ul = $("planList"); ul.innerHTML = "";
  S.plans.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML =
      `<button class="plan-go" aria-label="${L("ابدأ التمرين")}"><svg class="ic"><use href="#i-play"/></svg></button>
       <div class="plan-main"><b></b><span>${L("المدة")} ${mmss(planSeconds(p))} · ${planRounds(p)} ${L("جولة")}</span></div>
       <button class="plan-edit" aria-label="${L("تعديل")}"><svg class="ic"><use href="#i-edit"/></svg></button>`;
    li.querySelector("b").textContent = L(p.name);
    li.querySelector(".plan-go").onclick = () => startRun(p);
    li.querySelector(".plan-main").onclick = () => startRun(p);
    li.querySelector(".plan-edit").onclick = () => openBuilder(p);
    ul.appendChild(li);
  });

  const more = $("logMore");
  if (S.sessions.length > logLimit){
    more.hidden = false;
    more.textContent = L("عرض المزيد ({0})", S.sessions.length - logLimit);
    more.onclick = () => { logLimit += 20; renderLog(); };
  } else more.hidden = true;
}

/* ---------- builder ---------- */
function openBuilder(plan){
  S.editing = plan
    ? JSON.parse(JSON.stringify(plan))
    : { id: uid(), name:"", target:20, repeat:1, warm:180, cool:120, items:[] };
  $("buildTitle").textContent = plan ? L("تعديل الجدول") : L("جدول جديد");
  $("planName").value   = S.editing.name;
  $("planTarget").value = String(S.editing.target ?? 20);
  $("planRepeat").value = String(S.editing.repeat || 1);
  $("planWarm").value   = String(S.editing.warm ?? 0);
  $("planCool").value   = String(S.editing.cool ?? 0);
  $("btnBuildDelete").hidden = !plan || S.plans.length <= 1;
  pickKind = (plan && plan.items.some(isReps) && !plan.items.some(i => !isReps(i))) ? "reps" : "time";
  renderPicker();
  renderBuild();
  show("build");
}

let pickKind = "time";
function renderPicker(){
  const box = $("picker"); box.innerHTML = "";
  document.querySelectorAll("#pickTabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.pt === pickKind));

  (pickKind === "reps" ? WLIB : LIB).forEach(e => {
    const b = document.createElement("button");
    b.innerHTML = pickKind === "reps"
      ? `<span></span><small><bdi>${e.sets}×${e.reps}</bdi> · ${e.weight} ${L("كجم")}</small>`
      : `<span></span><small>${e.work}${L("ث")}</small>`;
    b.querySelector("span").textContent = e.name;
    if (hasShot(e.key)){
      const q = document.createElement("i");
      q.className = "pk-info"; q.textContent = "؟";
      q.title = L("شرح التمرين");
      q.onclick = ev => { ev.stopPropagation(); showHowto(e.key); };
      b.appendChild(q);
    }
    b.onclick = () => {
      S.editing.items.push(pickKind === "reps"
        ? { key:e.key, name:e.name, mode:"reps", sets:e.sets, reps:e.reps, weight:e.weight, rest:e.rest }
        : { key:e.key, name:e.name, work:e.work, rest:e.rest });
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
    const nums = isReps(it)
      ? `<span class="row-nums reps">
           <label>${L("مجموعات")}<input type="number" min="1" max="12" step="1" class="in-sets" value="${it.sets}"></label>
           <label>${L("عدّات")}<input type="number" min="1" max="60" step="1" class="in-reps" value="${it.reps}"></label>
           <label>${L("كجم")}<input type="number" min="0" max="500" step="2.5" class="in-kg" value="${it.weight}"></label>
           <label>${L("راحة")}<input type="number" min="0" max="300" step="5" class="in-rest" value="${it.rest}"></label>
         </span>`
      : `<span class="row-nums">
           <label>${L("عمل")}<input type="number" min="5" max="600" step="5" class="in-work" value="${it.work}"></label>
           <label>${L("راحة")}<input type="number" min="0" max="300" step="5" class="in-rest" value="${it.rest}"></label>
         </span>`;
    li.innerHTML =
      `<span class="row-badge">${i+1}</span>
       <span class="row-name"></span>
       ${nums}
       <span class="row-tools">
         <button class="up" aria-label="${L("أعلى")}">▲</button>
         <button class="dn" aria-label="${L("أسفل")}">▼</button>
         <button class="row-del del" aria-label="${L("حذف")}">✕</button>
       </span>`;
    li.querySelector(".row-name").textContent = L(it.name);
    if (isReps(it)) li.classList.add("lift-row");
    if (isReps(it)){
      li.querySelector(".in-sets").oninput = e => { it.sets = Math.max(1, +e.target.value || 1); updateGauge(); };
      li.querySelector(".in-reps").oninput = e => { it.reps = Math.max(1, +e.target.value || 1); updateGauge(); };
      li.querySelector(".in-kg").oninput   = e => { it.weight = Math.max(0, +e.target.value || 0); updateGauge(); };
    } else {
      li.querySelector(".in-work").oninput = e => { it.work = Math.max(5, +e.target.value || 5); updateGauge(); };
    }
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
  const vol = p.items.reduce((a,i) => a + itemVolume(i), 0) * Math.max(1, +p.repeat || 1);
  const volEl = $("gaugeVol");
  if (volEl){ volEl.hidden = !vol; volEl.textContent = vol ? L("حجم الرفع {0} كجم", vol) : ""; }
  const g = $("gauge");
  if (!goal){
    $("gaugeFill").style.width = p.items.length ? "100%" : "0%";
    $("gaugeNote").textContent = p.items.length ? L("{0} جولة — بدون مدة مستهدفة", planRounds(p)) : L("أضف تمارين للجدول");
    g.classList.remove("over");
    return;
  }
  $("gaugeFill").style.width = Math.min(100, secs / goal * 100) + "%";
  const diff = secs - goal;
  g.classList.toggle("over", diff > 0);
  $("gaugeNote").textContent =
    !p.items.length ? L("أضف تمارين للجدول") :
    Math.abs(diff) <= 20 ? L("مطابق للمدة المستهدفة ({0} دقيقة)", p.target) :
    diff > 0 ? L("أطول من المستهدف بـ {0} دقيقة", mmss(diff)) :
               L("ناقص {0} دقيقة عن المستهدف", mmss(-diff));
}

async function saveBuilder(){
  const p = S.editing;
  p.name = $("planName").value.trim() || L("جدول بدون اسم");
  updateGauge();
  if (!p.items.length){ toast(L("أضف تمريناً واحداً على الأقل")); return; }
  await savePlan(p);
  S.plans.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  toast(L("انحفظ الجدول"));
  show("plans");
}

/* ============================================================
   RUNNER
   ============================================================ */
let ticker = null, wake = null;

function startRun(plan){
  const segs = buildSegments(plan);
  if (!segs.length){ toast(L("الجدول فاضي")); return; }
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
  const lifting = !r.finished && seg.kind === "reps";

  $("runClock").textContent = r.finished ? L("تم") : lifting ? String(seg.reps) : mmss(left);
  $("runPhase").textContent = r.finished ? L("اكتمل التمرين")
    : lifting ? L("{0} · المجموعة {1} من {2}", seg.phase, seg.set, seg.sets) : seg.phase;
  $("runMove").textContent  = r.finished ? L(r.plan.name) : seg.name;
  $("runMove").classList.toggle("has-shot", !r.finished && hasShot(seg.key));
  $("runTip").textContent   = r.finished ? L("انحفظ في سجلك")
    : lifting ? L("عدّة — اضغط «تم» بعد ما تخلّص المجموعة")
    : (r.running ? seg.tip : L("متوقف"));
  const nx = r.segs[r.idx+1];
  $("runNext").innerHTML = (!r.finished && nx) ? L("بعده: <b>") + nx.name.replace(/</g,"&lt;") + "</b>" : "";

  /* شريط الوزن — يظهر فقط في تمارين الأوزان */
  const lift = $("liftBox");
  if (lift){
    lift.hidden = !lifting;
    if (lifting) $("liftKg").textContent = seg.weight ? String(seg.weight) : "—";
  }

  document.body.classList.toggle("is-rest", !r.finished && seg.kind === "rest");
  document.body.classList.toggle("is-prep", !r.finished && seg.kind === "prep");
  document.body.classList.toggle("is-lift", lifting);

  const total = doneBefore(r.idx) + Math.min(r.elapsed, seg.dur);
  const pct = Math.min(1, total / r.total);
  $("runLeft").textContent = currentRound()
    ? L("الجولة {0} من {1}", currentRound(), r.rounds)
    : L("{0} جولة", r.rounds);
  $("runRight").textContent = L("باقي {0} من {1}", mmss(r.total - total), mmss(r.total));

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

  const sh = $("btnShareRun");
  if (sh) sh.hidden = !(r.finished && lastSess);

  const label = r.finished ? L("من جديد")
    : (lifting && r.running) ? L("تم")
    : (r.running ? L("إيقاف") : (total > 0 ? L("أكمل") : L("ابدأ")));
  const icon  = (lifting && r.running) ? "i-check" : (r.running ? "i-pause" : "i-play");
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

/* ---------- صوت يقرأ التمرين ---------- */
let arVoice = null;
function pickVoice(){
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices() || [];
  const pre = lang() === "en" ? /^en/i : /^ar/i;
  arVoice = vs.find(v => pre.test(v.lang)) || null;
}
if ("speechSynthesis" in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text){
  if (!$("optVoice") || !$("optVoice").checked) return;
  if (!("speechSynthesis" in window) || !text) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH(); u.rate = 1.02;
    if (arVoice) u.voice = arVoice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch(e){}
}
function saySegment(seg, next){
  if (!seg) return;
  if (seg.kind === "rest") speak(next ? L("راحة، بعدها {0}", next.name) : L("راحة"));
  else if (seg.kind === "reps")
    speak(L("{0}، {1} عدة{2}", seg.name, seg.reps, seg.weight ? L("، {0} كيلو", seg.weight) : ""));
  else speak(seg.name);
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

  /* مجموعة أوزان: ما فيه عدّ تنازلي — تنتظر ضغطة «تم» */
  if (r.segs[r.idx] && r.segs[r.idx].open){ renderRun(); return; }

  const whole = Math.ceil(r.segs[r.idx].dur - r.elapsed);
  if (whole <= 3 && whole > 0 && whole !== r.beeped){ r.beeped = whole; beep(760, 110, .18); }

  while (r.idx < r.segs.length && r.elapsed >= r.segs[r.idx].dur){
    r.elapsed -= r.segs[r.idx].dur; r.idx++; r.beeped = -1;
    if (r.idx >= r.segs.length){ finishRun(true); return; }
    beep(r.segs[r.idx].kind === "rest" ? 430 : 980, 260, .3);
    saySegment(r.segs[r.idx], r.segs[r.idx + 1]);
  }
  renderRun();
}

function play(){
  const r = S.run; if (!r) return;
  if (r.finished){ startRun(r.plan); return; }
  r.running = true; r.last = Date.now();
  beep(980, 200, .28); keepAwake(true);
  saySegment(r.segs[r.idx], r.segs[r.idx + 1]);
  if (!ticker) ticker = setInterval(tick, 120);
  renderRun();
}
/* ينتقل للمقطع التالي — يستخدمه زر «التالي» وزر «تم» في مجموعات الأوزان */
function advance(){
  const r = S.run; if (!r || r.finished) return;
  if (r.segs[r.idx] && r.segs[r.idx].kind === "reps") r.setsDone = (r.setsDone || 0) + 1;
  r.elapsed = 0; r.beeped = -1; r.idx++;
  if (r.idx >= r.segs.length){ r.idx = r.segs.length - 1; finishRun(true); return; }
  if (r.running){
    beep(r.segs[r.idx].kind === "rest" ? 430 : 980, 240, .28);
    saySegment(r.segs[r.idx], r.segs[r.idx + 1]);
  }
  renderRun();
}

/* تغيير وزن التمرين أثناء الجلسة — ينحفظ في الجدول */
function bumpWeight(delta){
  const r = S.run; if (!r) return;
  const seg = r.segs[Math.min(r.idx, r.segs.length-1)];
  if (!seg || seg.kind !== "reps") return;
  const w = Math.max(0, Math.round(((+seg.weight||0) + delta) * 2) / 2);
  if (seg.item) seg.item.weight = w;
  for (let i = r.idx; i < r.segs.length; i++)
    if (r.segs[i].kind === "reps" && r.segs[i].item === seg.item) r.segs[i].weight = w;
  r.weightChanged = true;
  renderRun();
}

function pause(){ if (S.run){ S.run.running = false; } keepAwake(false); renderRun(); }
function stopTimer(){ if (ticker){ clearInterval(ticker); ticker = null; } keepAwake(false); }

/* ملخّص الأوزان للمقاطع المنجزة */
function liftSummary(uptoIdx){
  const map = new Map();
  S.run.segs.slice(0, uptoIdx).forEach(s => {
    if (s.kind !== "reps") return;
    const cur = map.get(s.name) || { name:s.name, sets:0, reps:s.reps, weight:0 };
    cur.sets++; cur.reps = s.reps; cur.weight = Math.max(cur.weight, +s.weight||0);
    map.set(s.name, cur);
  });
  const lifts = [...map.values()];
  return { lifts, volume: Math.round(lifts.reduce((a,l) => a + l.sets*l.reps*l.weight, 0)) };
}

let lastSess = null;
async function finishRun(complete){
  const r = S.run; if (!r) return;
  r.running = false; stopTimer();
  const rounds = complete ? r.rounds : currentRound();
  const secs = complete ? r.total : doneBefore(r.idx) + r.elapsed;
  const { lifts, volume } = liftSummary(complete ? r.segs.length : r.idx);

  if (r.weightChanged){ try { await savePlan(r.plan); } catch(e){} }

  if (rounds > 0){
    const sess = {
      id: uid(), at: Date.now(), planId: r.plan.id, planName: r.plan.name,
      rounds, total: r.rounds, secs: Math.round(secs), completed: !!complete
    };
    if (volume > 0){ sess.volume = volume; sess.lifts = lifts; }
    lastSess = sess;
    await saveSession(sess);
    await refreshStreak();
    socialAfterWorkout(sess);
  }
  if (complete){
    r.finished = true;
    beep(880, 300, .3); setTimeout(() => beep(1180, 420, .3), 320);
    const st = streakInfo();
    renderRun();
    toast(volume > 0 ? L("رفعت {0} كجم في هذا التمرين 💪", volume)
        : st.current > 1 ? L("ممتاز — {0} أيام متتالية", st.current) : L("أحسنت، انحفظ التمرين"));
  } else {
    S.run = null;
    show("home");
    if (rounds > 0) toast(L("انحفظ {0} من {1} جولة", rounds, r.rounds));
  }
}

/* ---------- log ---------- */
let logLimit = 12;
function renderLog(){
  const ul = $("log"); ul.innerHTML = "";
  $("logEmpty").hidden = S.sessions.length > 0;
  ul.hidden = S.sessions.length === 0;
  $("logCount").textContent = S.sessions.length ? L("{0} تمرين", S.sessions.length) : "";

  S.sessions.slice(0, logLimit).forEach(s => {
    const d = new Date(s.at);
    const date = d.toLocaleDateString(LOC(), { weekday:"long", day:"numeric", month:"long" });
    const time = d.toLocaleTimeString(LOC(), { hour:"numeric", minute:"2-digit" });
    const li = document.createElement("li");
    if (s.completed === false) li.className = "partial";
    if (s.manual) li.className = "manual";
    const icon = s.manual ? "user" : s.completed === false ? "timer" : "check";
    const meta = (s.manual && !s.planId)
      ? `${date} · ${time} · ${mmss(s.secs)}`
      : `${date} · ${time} · ${s.rounds}/${s.total || s.rounds} ${L("جولة")} · ${mmss(s.secs)}`;
    /* الجدول ما زال موجوداً؟ إذاً نعرض زر التكرار */
    const again = s.planId && S.plans.some(p => p.id === s.planId);
    li.innerHTML =
      `<span class="log-ic"><svg class="ic"><use href="#i-${icon}"/></svg></span>
       <button class="log-main" aria-label="${L("عدّل هذا التمرين")}"><b></b><span>${meta}
         <svg class="ic log-pen"><use href="#i-edit"/></svg></span></button>
       ${again ? `<button class="log-again" aria-label="${L("كرّر هذا التمرين")}"><svg class="ic"><use href="#i-play"/></svg></button>` : ""}
       <button class="log-del" aria-label="${L("احذف هذا التمرين")}"><svg class="ic"><use href="#i-trash"/></svg></button>`;
    li.querySelector("b").textContent = L(s.planName || "تمرين");
    li.querySelector(".log-main").onclick = () => openManual(s);
    const btnAgain = li.querySelector(".log-again");
    if (btnAgain) btnAgain.onclick = () => {
      const plan = S.plans.find(p => p.id === s.planId);
      if (!plan){ toast(L("الجدول انحذف — ما عاد ممكن تكراره")); renderLog(); return; }
      startRun(plan);
    };
    li.querySelector(".log-del").onclick = async () => {
      const ok = await ask(L("حذف التمرين"), L("{0} — {1}. الحذف يؤثر على عدّاد الأيام المتتالية.", L(s.planName || "تمرين"), date));
      if (!ok) return;
      await deleteSession(s.id);
      renderLog();
      toast(L("انحذف التمرين من السجل"));
    };
    ul.appendChild(li);
  });
}

/* ============================================================
   WIRING
   ============================================================ */
$("btnGoogle").onclick = signInGoogle;
$("btnGuest").onclick  = goGuest;

/* الدخول بالبريد */
$("btnMailToggle").onclick = () => {
  $("mailForm").hidden = false;
  $("btnMailToggle").hidden = true;
  setAuthMode("in");
  $("auMail").focus();
};
$("mailForm").addEventListener("submit", mailSubmit);
$("btnAuthMode").onclick = () => setAuthMode(authMode === "up" ? "in" : "up");
$("btnForgot").onclick   = forgotPass;

document.querySelectorAll(".tabbar button").forEach(b => {
  b.onclick = () => { if (S.run && S.run.running) pause(); show(b.dataset.view); };
});

$("btnQuickStart").onclick = () => { const p = todaySlot().plan; if (p) startRun(p); };

/* ---------------- عامل الخدمة ----------------
   يجلب من الشبكة أولاً فتصل التحديثات فوراً، ويرجع للنسخة المخزّنة
   عند انقطاع الاتصال. نفس الملف الذي يستقبل الإشعارات — عامل واحد للنطاق. */
if ("serviceWorker" in navigator){
  addEventListener("load", () => {
    navigator.serviceWorker.register("./firebase-messaging-sw.js").catch(() => {});
  });
}

/* ---------------- مشاركة جدول برابط ----------------
   الجدول يُرمَّز في hash الرابط، ومن يفتحه يُعرض عليه حفظه.
   محتوى الرابط يأتي من شخص آخر، فكل قيمة تُقصّ وتُحوَّل لعدد قبل استعمالها. */
const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = s => new TextDecoder().decode(
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));

function planToLink(p){
  const d = {
    v: 1, n: p.name, w: +p.warm || 0, c: +p.cool || 0,
    r: +p.repeat || 1, t: +p.target || 20,
    i: p.items.map(it => isReps(it)
      ? { k:it.key, n:it.name, m:1, s:+it.sets||1, p:+it.reps||1, g:+it.weight||0, r:+it.rest||0 }
      : { k:it.key, n:it.name, w:+it.work||0, r:+it.rest||0 })
  };
  return location.origin + location.pathname + "#p=" + b64e(JSON.stringify(d));
}

function linkToPlan(code){
  let d;
  try { d = JSON.parse(b64d(code)); } catch(e){ return null; }
  if (!d || !Array.isArray(d.i) || !d.i.length) return null;
  const txt = (v, max) => String(v == null ? "" : v).slice(0, max).trim();
  const num = (v, min, max, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    id: uid(),
    name: txt(d.n, 60) || L("جدول مشترك"),
    warm: num(d.w, 0, 900, 0), cool: num(d.c, 0, 900, 0),
    repeat: num(d.r, 1, 30, 1), target: num(d.t, 1, 180, 20),
    items: d.i.slice(0, 40).map(it => it && it.m === 1
      ? { key: txt(it.k, 4) || "X", name: txt(it.n, 40) || L("تمرين"), mode:"reps",
          sets: num(it.s, 1, 20, 3), reps: num(it.p, 1, 100, 10),
          weight: num(it.g, 0, 500, 0), rest: num(it.r, 0, 600, 60) }
      : { key: txt(it.k, 4) || "X", name: txt(it.n, 40) || L("تمرين"),
          work: num(it && it.w, 5, 900, 45), rest: num(it && it.r, 0, 600, 15) })
  };
}

$("btnBuildShare").onclick = async () => {
  const p = S.editing;
  if (!p || !p.items.length){ toast(L("الجدول فاضي")); return; }
  const url = planToLink(p);
  const text = L("جرّب هذا الجدول في نادي الجبال: {0}", L(p.name));
  try {
    if (navigator.share) await navigator.share({ title: L(p.name), text, url });
    else { await navigator.clipboard.writeText(url); toast(L("انتسخ رابط الجدول")); }
  } catch(e){
    try { await navigator.clipboard.writeText(url); toast(L("انتسخ رابط الجدول")); } catch(_){}
  }
};

/* جدول وصل عبر رابط */
let gotPlan = null;
(function readPlanLink(){
  const m = (location.hash || "").match(/[#&]p=([A-Za-z0-9\-_]+)/);
  if (!m) return;
  gotPlan = linkToPlan(m[1]);
  history.replaceState(null, "", location.pathname + location.search);
})();

function offerPlan(){
  if (!gotPlan) return;
  const p = gotPlan;
  $("gpName").textContent = L(p.name);
  $("gpMeta").textContent = L("{0} تمرين · {1} جولة · {2}",
    p.items.length, planRounds(p), mmss(planSeconds(p)));
  $("gotPlanSheet").hidden = false;
}
$("gpNo").onclick = () => { gotPlan = null; $("gotPlanSheet").hidden = true; };
$("gpSave").onclick = async () => {
  const p = gotPlan; gotPlan = null; $("gotPlanSheet").hidden = true;
  if (!p) return;
  await savePlan(p);
  renderPlans(); renderHome();
  show("plans");
  toast(L("انحفظ الجدول في جداولك"));
};

/* ---------------- تمرين سريع بالمدة المتاحة ----------------
   يُبنى من مكتبة التمارين ويُشغَّل مباشرة بلا حفظ. */
const FAST_MINS = [5, 10, 15, 20];
let fastPick = 10;

function fastPlan(mins){
  const target = mins * 60;
  const n = mins <= 5 ? 3 : mins <= 10 ? 4 : 5;
  const pool = [...LIB].sort(() => Math.random() - .5).slice(0, n);
  const items = pool.map(e => ({ key:e.key, name:e.name, work:e.work, rest:e.rest }));
  const warm = mins >= 10 ? 30 : 0;
  const cool = mins >= 15 ? 30 : 0;
  const one  = items.reduce((a, i) => a + estWork(i) + estRest(i), 0);
  const repeat = Math.max(1, Math.min(12, Math.round((target - warm - cool) / one)));
  return { id:"fast-" + uid(), name:L("تمرين سريع — {0} دقيقة", mins),
           items, warm, cool, repeat, fast:true };
}

function fastRender(){
  $("fastMins").innerHTML = FAST_MINS.map(m =>
    `<button type="button" class="chip${m === fastPick ? " on" : ""}" data-m="${m}">${L("{0} دقيقة", m)}</button>`).join("");
  $("fastMins").querySelectorAll(".chip").forEach(b => {
    b.onclick = () => { fastPick = +b.dataset.m; fastRender(); };
  });
  const p = fastPlan(fastPick);
  $("fastNote").textContent = L("{0} جولة · {1}", planRounds(p), mmss(planSeconds(p)));
}

$("btnFast").onclick = () => { fastRender(); $("fast").hidden = false; };
$("fastNo").onclick  = () => { $("fast").hidden = true; };
$("fast").addEventListener("click", e => { if (e.target.id === "fast") $("fastNo").click(); });
$("fastGo").onclick  = () => { $("fast").hidden = true; startRun(fastPlan(fastPick)); };

/* ---------------- شرح التمرين بالرسومات ----------------
   الرسومات في ex.js كنص SVG باسم مفتاح التمرين، وألوانها من متغيّرات
   التطبيق فتتبع الوضع الليلي. التمارين المخصّصة بلا رسمة. */
const hasShot = k => !!SHOTS[k];

function showHowto(key, name, tip){
  if (!hasShot(key)) return;
  const e = [...LIB, ...WLIB].find(x => x.key === key);
  $("htImg").innerHTML = SHOTS[key];
  $("htName").textContent = name || (e && e.name) || L("تمرين");
  $("htTip").textContent  = tip  || (e && e.tip)  || "";
  $("howto").hidden = false;
}
$("htNo").onclick = () => { $("howto").hidden = true; };
$("howto").addEventListener("click", e => { if (e.target.id === "howto") $("htNo").click(); });
$("runMove").onclick = () => {
  const r = S.run; if (!r || r.finished) return;
  const seg = r.segs[r.idx]; if (!seg) return;
  showHowto(seg.key, seg.name, seg.tip);
};

/* ---------------- تسجيل تمرين تمّ خارج التطبيق ---------------- */
const MN_KINDS = ["مشي","جري","نادي","دراجة","سباحة","كرة قدم"];
const dateInput = ms => {   // YYYY-MM-DD بالتوقيت المحلي
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

/* المصدر: جدول محفوظ أو نشاط يكتبه المستخدم */
let mnSrc = "free";
function mnMode(src){
  mnSrc = S.plans.length ? src : "free";
  $("mnPlanBox").hidden = mnSrc !== "plan";
  $("mnFreeBox").hidden = mnSrc === "plan";
  document.querySelectorAll("#mnTabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.ms === mnSrc));
  if (mnSrc === "plan") mnPlanMins();
}
/* مدة الجدول المختار تُملأ تلقائياً */
function mnPlanMins(){
  const p = S.plans.find(x => x.id === $("mnPlan").value);
  if (p) $("mnMins").value = Math.max(1, Math.round(planSeconds(p) / 60));
}

/* الورقة نفسها تُستعمل للتسجيل الجديد وللتعديل — mnEdit يحمل التمرين المعدَّل */
let mnEdit = null;

$("btnManual").onclick = () => openManual(null);

function openManual(sess){
  mnEdit = sess || null;
  $("mnTitle").textContent = mnEdit ? L("عدّل التمرين") : L("سجّل تمرين");
  $("mnIntro").textContent = mnEdit
    ? L("عدّل المدة أو التاريخ — التغيير يؤثر على عدّاد الأيام المتتالية.")
    : L("تمرين تمّ خارج التطبيق — يدخل في السجل وفي عدّاد الأيام المتتالية.");
  $("mnSave").querySelector("span").textContent = mnEdit ? L("احفظ التعديل") : L("احفظ التمرين");
  $("mnKinds").innerHTML = MN_KINDS.map(k =>
    `<button type="button" class="chip">${L(k)}</button>`).join("");
  $("mnKinds").querySelectorAll(".chip").forEach((b, i) => {
    b.onclick = () => {
      $("mnName").value = L(MN_KINDS[i]);
      $("mnKinds").querySelectorAll(".chip").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
    };
  });
  const today = dateInput(Date.now());
  $("mnDate").max = today;

  $("mnPlan").innerHTML = S.plans.map(p =>
    `<option value="${p.id}"></option>`).join("");
  S.plans.forEach((p, i) => { $("mnPlan").options[i].textContent = L(p.name); });

  if (mnEdit){
    /* التعديل لا يغيّر مصدر التمرين — الاسم من جدول يبقى كما هو */
    $("mnName").value = L(mnEdit.planName || "تمرين");
    $("mnMins").value = Math.max(1, Math.round((mnEdit.secs || 0) / 60));
    $("mnDate").value = dateInput(mnEdit.at);
    $("mnTabs").hidden = true;
    mnMode("free");
    $("mnKinds").hidden = true;
    $("mnName").disabled = !!mnEdit.planId;
  } else {
    $("mnName").value = "";
    $("mnMins").value = 30;
    $("mnDate").value = today;
    $("mnKinds").hidden = false;
    $("mnName").disabled = false;
    $("mnTabs").hidden = !S.plans.length;
    mnMode(S.plans.length ? "plan" : "free");
  }
  $("manual").hidden = false;
}

document.querySelectorAll("#mnTabs button").forEach(b => {
  b.onclick = () => mnMode(b.dataset.ms);
});
$("mnPlan").onchange = mnPlanMins;

$("mnNo").onclick = () => { $("manual").hidden = true; };
$("manual").addEventListener("click", e => { if (e.target.id === "manual") $("mnNo").click(); });

$("mnSave").onclick = async () => {
  const plan = mnSrc === "plan" ? S.plans.find(p => p.id === $("mnPlan").value) : null;
  const name = plan ? L(plan.name) : ($("mnName").value || "").trim();
  const mins = Math.round(Number($("mnMins").value));
  if (!name){ toast(L("اكتب اسم التمرين")); $("mnName").focus(); return; }
  if (!(mins > 0)){ toast(L("اكتب مدة التمرين بالدقائق")); $("mnMins").focus(); return; }

  /* تاريخ اليوم نفسه يأخذ وقته الحالي، والأيام السابقة تُسجَّل ظهراً */
  const [y, mo, d] = ($("mnDate").value || dateInput(Date.now())).split("-").map(Number);
  const picked = new Date(y, mo - 1, d, 12, 0, 0);
  const isToday = dateInput(picked.getTime()) === dateInput(Date.now());
  const at = Math.min(isToday ? Date.now() : picked.getTime(), Date.now());

  $("manual").hidden = true;

  if (mnEdit){
    const sess = { ...mnEdit, at, planName: name, secs: mins * 60 };
    await updateSession(sess);
    await refreshStreak();
    socialAfterWorkout(sess);
    renderLog(); renderHome();
    toast(L("انحفظ التعديل"));
    mnEdit = null;
    return;
  }

  const rounds = plan ? planRounds(plan) : 1;
  const sess = {
    id: uid(), at, planId: plan ? plan.id : "", planName: name,
    rounds, total: rounds, secs: mins * 60, completed: true, manual: true
  };
  await saveSession(sess);
  await refreshStreak();
  socialAfterWorkout(sess);
  renderLog(); renderHome();
  toast(L("انحفظ التمرين — {0} دقيقة", mins));
};
$("btnNewPlan").onclick    = () => openBuilder(null);
$("btnBuildCancel").onclick = () => show("plans");
$("btnBuildSave").onclick   = saveBuilder;
$("btnBuildDelete").onclick = async () => {
  const ok = await ask(L("حذف الجدول"), L("{0} — ما راح يظهر في قائمة الجداول.", S.editing.name || L("هذا الجدول")));
  if (!ok) return;
  await removePlan(S.editing.id);
  toast(L("انحذف الجدول"));
  show("plans");
};
["planRepeat","planWarm","planCool","planTarget"].forEach(id => { $(id).onchange = updateGauge; });
$("btnCustomAdd").onclick = () => {
  const v = $("customName").value.trim();
  if (!v) return;
  S.editing.items.push(pickKind === "reps"
    ? { key:"X", name:v, mode:"reps", sets:3, reps:10, weight:10, rest:60 }
    : { key:"X", name:v, work:45, rest:15 });
  $("customName").value = "";
  renderBuild();
};
$("customName").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); $("btnCustomAdd").click(); } });

$("btnPrimary").onclick = () => {
  const r = S.run; if (!r) return;
  const seg = r.segs[Math.min(r.idx, r.segs.length-1)];
  if (!r.finished && r.running && seg && seg.open){ advance(); return; }   // «تم» للمجموعة
  r.running ? pause() : play();
};
$("btnSkip").onclick = () => advance();
$("liftMinus").onclick = () => bumpWeight(-2.5);
$("liftPlus").onclick  = () => bumpWeight(+2.5);

document.querySelectorAll("#pickTabs button").forEach(b => {
  b.onclick = () => { pickKind = b.dataset.pt; renderPicker(); };
});
$("btnStop").onclick = async () => {
  if (!S.run) return;
  if (S.run.finished){ S.run = null; show("home"); return; }
  const ok = await ask(L("إنهاء التمرين"), L("اللي أنجزته ينحفظ في السجل."), L("أنهِ التمرين"));
  if (!ok) return;
  finishRun(false);
};

$("btnAccount").onclick = () => {
  $("sheetName").textContent = S.user.name;
  $("sheetMail").textContent = S.user.email || L("بدون بريد");
  const mid = memberId();
  $("sheetSync").textContent = S.mode === "cloud"
    ? (mid ? L("رقم عضويتك {0} — بياناتك تتزامن بين أجهزتك.", mid)
           : L("بياناتك محفوظة في حسابك وتتزامن بين أجهزتك."))
    : L("وضع محلي — البيانات على هذا الجهاز فقط. سجّل بجوجل للمزامنة.");
  $("btnSignOut").textContent = S.mode === "cloud" ? L("تسجيل الخروج") : L("رجوع لشاشة الدخول");
  $("sheet").hidden = false;
  renderPush();
};
/* ---------------- المظهر: تلقائي / فاتح / ليلي ---------------- */
const THEME_KEY = "hejaz.theme";
const themePref = () => { try { return localStorage.getItem(THEME_KEY) || "auto"; } catch(e){ return "auto"; } };
function applyTheme(){
  const pref = themePref();
  const dark = pref === "dark" ||
    (pref === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dark ? "#150E15" : "#FFF6EF";
  document.querySelectorAll("#themeSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.theme === pref));
}
document.querySelectorAll("#themeSeg button").forEach(b => {
  b.onclick = () => { try { localStorage.setItem(THEME_KEY, b.dataset.theme); } catch(e){} applyTheme(); };
});
try {
  window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => { if (themePref() === "auto") applyTheme(); });
} catch(e){}
applyTheme();

$("btnLang").textContent = lang() === "en" ? "العربية" : "English";
$("btnLang").onclick = () => setLang(lang() === "en" ? "ar" : "en");
$("btnCloseSheet").onclick = () => { $("sheet").hidden = true; };
$("btnSignOut").onclick = signOutNow;
$("sheet").addEventListener("click", e => { if (e.target.id === "sheet") $("sheet").hidden = true; });
$("confirm").addEventListener("click", e => { if (e.target.id === "confirm") $("cfNo").click(); });

/* ---------- boot ---------- */
/* ---------------- بطاقة الإنجاز ---------------- */
const dateLabel = at => new Date(at).toLocaleDateString(LOC(), { day:"numeric", month:"long", year:"numeric" });

function shareStreak(){
  const st = streakInfo();
  const done = S.sessions.filter(s => s.completed !== false);
  shareCard({
    eyebrow: L("سلسلة متواصلة"),
    big: st.current,
    unit: st.current === 1 ? L("يوم واحد") : L("يوماً متتالياً"),
    stats: [
      { v: done.length, l: L("تمرين") },
      { v: Math.round(S.sessions.reduce((a,s) => a + (s.secs||0), 0) / 60), l: L("دقيقة") },
      { v: badgeCount(), l: L("شارة") }
    ],
    date: dateLabel(Date.now())
  });
}

function shareWorkout(sess){
  if (!sess) return;
  const st = streakInfo();
  shareCard({
    eyebrow: L(sess.planName || "تمرين"),
    big: mmss(sess.secs),
    unit: L("{0} جولة", sess.rounds),
    stats: [
      { v: st.current, l: L("يوم متتالٍ") },
      sess.volume ? { v: sess.volume, l: L("كجم") } : null,
      { v: Math.round(sess.secs / 60), l: L("دقيقة") }
    ].filter(Boolean),
    date: dateLabel(sess.at)
  });
}

/* ---------------- حاسبة أقصى وزن (إيبلي) ---------------- */
const rmValue = (w, r) => Math.round((+w||0) * (1 + Math.max(1,+r||1) / 30) * 2) / 2;
function renderRM(){
  const one = rmValue($("rmW").value, $("rmR").value);
  $("rmOut").textContent = one || 0;
  $("rmTable").innerHTML = [95,90,85,80,75,70,60].map(pc => {
    const w = Math.round(one * pc / 100 * 2) / 2;
    const reps = Math.max(1, Math.round((one / w - 1) * 30)) || 1;
    return `<div class="rm-cell"><b>${pc}%</b><span>${w} ${L("كجم")}</span><small>&times;${reps}</small></div>`;
  }).join("");
}
function openRM(){
  ["rmW","rmR"].forEach(id => { $(id).oninput = renderRM; });
  renderRM();
  $("rm").hidden = false;
}
$("rmNo").onclick = () => { $("rm").hidden = true; };
$("rm").addEventListener("click", e => { if (e.target.id === "rm") $("rm").hidden = true; });

$("btnShareStreak").onclick = shareStreak;
$("btnShareRun").onclick = () => shareWorkout(lastSess);
$("shNo").onclick = () => { $("shareSheet").hidden = true; };
$("shareSheet").addEventListener("click", e => { if (e.target.id === "shareSheet") $("shareSheet").hidden = true; });

$("bdSave").onclick = submitBody;
$("bdNo").onclick = () => { $("bodySheet").hidden = true; };
$("bodySheet").addEventListener("click", e => { if (e.target.id === "bodySheet") $("bodySheet").hidden = true; });

const CTX = { S, toast, ask, dayKey, streakInfo, show, planRounds, planSeconds, addPlanCopy,
              badgeCount, openRM, openBody, delBody };
initSocial(CTX);
initProgress(CTX);
initPush(CTX);
wirePush();

/* حفظ تفضيلات الصوت */
const OPTS = lsGet("hejaz.opts", { sound:true, voice:true });
["optSound","optVoice"].forEach(id => {
  const el = $(id), key = id === "optSound" ? "sound" : "voice";
  el.checked = OPTS[key] !== false;
  el.addEventListener("change", () => {
    OPTS[key] = el.checked; lsSet("hejaz.opts", OPTS);
    if (key === "voice" && el.checked) speak(L("تمام"));
  });
});

(async function boot(){
  if (!hasConfig()) $("btnGoogle").disabled = false;   // still clickable, shows a helpful note
  watchAuth();
  if (lsGet(LK.mode, "") === "local") await goGuest();
})();

/* ============================================================
   دعم التطبيق — رابط تبرّع اختياري داخل صفحة الحساب
   ▸ غيّر السطر التالي فقط: ضع رابط الدفع من ميسر بين علامتي التنصيص.
   ▸ ما دام فارغاً، القسم كله لا يظهر في التطبيق إطلاقاً.
   ============================================================ */
const SUPPORT_URL = "";

(function supportCard(){
  if (!/^https:\/\/\S+$/i.test(SUPPORT_URL)) return;
  const sheetBox = document.querySelector("#sheet .sheet");
  const anchor   = document.getElementById("btnLang");
  if (!sheetBox || !anchor) return;

  /* أيقونة القلب تُضاف لمجموعة الأيقونات */
  const sprite = document.querySelector("svg symbol")?.parentNode;
  if (sprite && !document.getElementById("i-heart")){
    const sym = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
    sym.id = "i-heart";
    sym.setAttribute("viewBox", "0 0 24 24");
    sym.innerHTML = '<path d="M12 20.4C8.3 17.9 4 14.4 4 10.6A4.1 4.1 0 0 1 12 8.6a4.1 4.1 0 0 1 8 2c0 3.8-4.3 7.3-8 9.8Z"/>';
    sprite.appendChild(sym);
  }

  const t = lang() === "en" ? {
    title:"Support Mountains Club",
    text :"The app is free and will stay free. If you like it and want to help keep it going, the door is open.",
    btn  :"Support the app",
    note :"Payments via Moyasar — mada, Apple Pay and credit cards"
  } : {
    title:"ادعم نادي الجبال",
    text :"التطبيق مجاني ويبقى مجانياً. لو حبيت تساهم في استمراره، الباب مفتوح.",
    btn  :"ادعم التطبيق",
    note :"الدفع عبر ميسر — مدى، آبل باي، والبطاقات الائتمانية"
  };

  const box = document.createElement("div");
  box.className = "support";
  box.innerHTML =
    '<span class="support-ic"><svg class="ic"><use href="#i-heart"/></svg></span>' +
    '<p class="support-title"></p><p class="support-text"></p>' +
    '<a class="btn btn-support" target="_blank" rel="noopener noreferrer">' +
      '<svg class="ic"><use href="#i-heart"/></svg><span></span></a>' +
    '<p class="support-note"></p>';
  box.querySelector(".support-title").textContent    = t.title;
  box.querySelector(".support-text").textContent     = t.text;
  box.querySelector(".btn-support span").textContent = t.btn;
  box.querySelector(".support-note").textContent     = t.note;
  box.querySelector("a").href = SUPPORT_URL;
  sheetBox.insertBefore(box, anchor);
})();
