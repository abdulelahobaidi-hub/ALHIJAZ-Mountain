/* ============================================================
   نادي الجبال — التذكير اليومي بالتمرين
   يسجّل جهازك في FCM ويحفظ وقت التذكير في reminders/{uid}
   ============================================================ */
import { L, lang } from "./i18n.js";

const VAPID = "BDtrmsST2wEEEg-bWjhpVNQhM1DyTXWbZnRfnQHw3VUgPUdt4FOrd1_ykgpmoGYfMksmvP2WG6OraQ1SpGTqXjg";
const V = "https://www.gstatic.com/firebasejs/10.12.5";

let C = null;                       // سياق التطبيق
let conf = { enabled: false, hour: 18, minute: 0 };
let swReg = null;

export function initPush(ctx){ C = ctx; }

const supported = () =>
  "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;

const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh"; }
                   catch(e){ return "Asia/Riyadh"; } };

const pad2 = n => (n < 10 ? "0" : "") + n;
export const remTime = () => pad2(conf.hour) + ":" + pad2(conf.minute);

/* ---------- تحميل الإعداد المحفوظ ---------- */
export async function loadPush(){
  conf = { enabled: false, hour: 18, minute: 0 };
  const S = C && C.S;
  if (!S || S.mode !== "cloud" || !S.fb) return conf;
  const { db, m } = S.fb;
  try {
    const snap = await m.getDoc(m.doc(db, "reminders", S.user.uid));
    if (snap.exists()){
      const d = snap.data();
      conf = { enabled: !!d.enabled, hour: +d.hour || 18, minute: +d.minute || 0 };
    }
  } catch(err){ console.error("loadPush", err); }
  return conf;
}

async function saveConf(extra = {}){
  const S = C.S;
  const { db, m } = S.fb;
  await m.setDoc(m.doc(db, "reminders", S.user.uid), {
    uid: S.user.uid,
    name: S.user.name || "",
    enabled: !!conf.enabled,
    hour: conf.hour, minute: conf.minute,
    tz: tz(), lang: lang(),
    updatedAt: Date.now(),
    ...extra
  }, { merge: true });
}

/* ---------- تسجيل الجهاز ---------- */
const errCode = e => (e && (e.code || e.name)) ? (e.code || e.name) : String((e && e.message) || e).slice(0, 80);

async function registerDevice(){
  /* ١ — عامل الخدمة */
  try {
    if (!swReg) swReg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
  } catch(e){ return { ok:false, step:"sw", code: errCode(e) }; }

  /* ٢ — إذن الإشعارات */
  let perm = Notification.permission;
  if (perm !== "granted"){
    try { perm = await Notification.requestPermission(); }
    catch(e){ return { ok:false, step:"perm", code: errCode(e) }; }
  }
  if (perm !== "granted") return { ok:false, step:"perm", code: perm };

  /* ٣ — رمز الجهاز من FCM */
  let token = "", messaging = null, msgM = null;
  try {
    msgM = await import(`${V}/firebase-messaging.js`);
    messaging = msgM.getMessaging(C.S.fb.app);
    token = await msgM.getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: swReg });
  } catch(e){ return { ok:false, step:"token", code: errCode(e) }; }
  if (!token) return { ok:false, step:"token", code:"empty" };

  /* إشعار داخل التطبيق وهو مفتوح */
  try {
    msgM.onMessage(messaging, payload => {
      const d = (payload && payload.data) || {};
      if (d.body && C.toast) C.toast(d.body, 5000);
    });
  } catch(e){}

  return { ok:true, token };
}

/* ---------- الواجهة ---------- */
function note(msg){ const el = document.getElementById("remNote"); if (el) el.textContent = msg; }

export async function renderPush(){
  const sw = document.getElementById("remOn");
  const sel = document.getElementById("remTime");
  if (!sw || !sel) return;

  /* خيارات الوقت كل نصف ساعة */
  if (!sel.options.length){
    for (let h = 5; h <= 23; h++){
      for (const mn of [0, 30]){
        const o = document.createElement("option");
        o.value = h + ":" + mn;
        o.textContent = pad2(h) + ":" + pad2(mn);
        sel.appendChild(o);
      }
    }
  }

  const S = C.S;
  const cloud = S.mode === "cloud" && S.fb;
  await loadPush();
  sw.checked = !!conf.enabled;
  sel.value = conf.hour + ":" + conf.minute;
  sel.disabled = !conf.enabled;

  if (!cloud){ sw.disabled = true; note(L("سجّل دخولك عشان يوصلك التذكير على جوالك.")); return; }
  if (!supported()){ sw.disabled = true; note(L("متصفحك ما يدعم الإشعارات.")); return; }
  if (isIOS() && !installed()){
    sw.disabled = true;
    note(L("على الآيفون: افتح زر المشاركة في سفاري ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من الأيقونة عشان تشتغل الإشعارات."));
    return;
  }
  sw.disabled = false;
  if (Notification.permission === "denied"){
    note(L("الإشعارات محظورة لهذا الموقع — فعّلها من إعدادات جهازك."));
  } else if (conf.enabled){
    note(L("راح يوصلك تذكير كل يوم الساعة {0}.", remTime()));
  } else {
    note(L("تذكير واحد في اليوم — ما يوصلك إذا كنت خلّصت تمرينك."));
  }
}

export function wirePush(){
  const sw = document.getElementById("remOn");
  const sel = document.getElementById("remTime");
  if (!sw || !sel) return;

  sw.addEventListener("change", async () => {
    if (!sw.checked){
      conf.enabled = false;
      sel.disabled = true;
      try { await saveConf(); } catch(e){ console.error(e); }
      note(L("وقّفنا التذكير."));
      return;
    }
    sw.disabled = true;
    note(L("لحظة…"));
    try {
      const r = await registerDevice();
      if (!r.ok){
        sw.checked = false;
        console.error("push step:", r.step, r.code);
        if (r.step === "perm" && r.code === "denied")
          note(L("الإشعارات محظورة لهذا الموقع — فعّلها من إعدادات جهازك."));
        else if (r.step === "perm")
          note(L("لازم تسمح بالإشعارات عشان يوصلك التذكير."));
        else if (r.step === "sw")
          note(L("تعذّر تشغيل خدمة الإشعارات ({0}) — أعد تحميل الصفحة وجرّب.", r.code));
        else
          note(L("تعذّر تسجيل جهازك في الإشعارات ({0}).", r.code));
        return;
      }
      conf.enabled = true;
      const [h, mn] = sel.value.split(":").map(Number);
      conf.hour = h; conf.minute = mn;
      try {
        await saveConf({ token: r.token });
      } catch(e){
        sw.checked = false; conf.enabled = false;
        console.error("push save", e);
        note(L("تعذّر حفظ الإعداد ({0}) — تأكد أنك نشرت قواعد Firestore المحدّثة.", errCode(e)));
        return;
      }
      sel.disabled = false;
      note(L("تمام — راح يوصلك تذكير كل يوم الساعة {0}.", remTime()));
    } catch(err){
      console.error("push", err);
      sw.checked = false;
      note(L("تعذّر التفعيل ({0}) — جرّب مرة ثانية.", errCode(err)));
    } finally {
      sw.disabled = false;
    }
  });

  sel.addEventListener("change", async () => {
    const [h, mn] = sel.value.split(":").map(Number);
    conf.hour = h; conf.minute = mn;
    if (!conf.enabled) return;
    try { await saveConf(); note(L("راح يوصلك تذكير كل يوم الساعة {0}.", remTime())); }
    catch(err){ console.error(err); note(L("تعذّر الحفظ")); }
  });
}
