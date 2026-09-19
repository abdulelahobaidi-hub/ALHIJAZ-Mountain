/* ============================================================
   نادي الجبال — إرسال التذكير اليومي
   يشتغل على GitHub Actions كل ربع ساعة ويرسل لمن حان وقته
   ============================================================ */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const WINDOW_MIN = 8;                 // نافذة التطابق حول الوقت المطلوب

const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!creds.project_id){
  console.error("FIREBASE_SERVICE_ACCOUNT مفقود أو غير صالح");
  process.exit(1);
}
initializeApp({ credential: cert(creds) });
const db = getFirestore();
const fcm = getMessaging();

const pad = n => (n < 10 ? "0" : "") + n;

/* الوقت المحلي عند المستخدم بالدقائق منذ منتصف الليل + مفتاح اليوم */
function localNow(tz){
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return {
    minutes: (+p.hour) * 60 + (+p.minute),
    dayKey: `${p.year}-${p.month}-${p.day}`
  };
}

const TXT = {
  ar: {
    title: "نادي الجبال",
    plain: "وقت التمرين 💪",
    streak: n => `وقت التمرين 💪 — لا تكسر سلسلتك (${n} ${n === 1 ? "يوم" : "أيام"})`
  },
  en: {
    title: "Mountains Club",
    plain: "Time to train 💪",
    streak: n => `Time to train 💪 — keep your ${n}-day streak alive`
  }
};

/* هل درّب اليوم؟ */
async function trainedToday(uid, dayKey, tz){
  const start = new Date(`${dayKey}T00:00:00`);
  const guess = start.getTime() - 24 * 3600e3;          // هامش آمن حول المناطق الزمنية
  const snap = await db.collection("users").doc(uid).collection("sessions")
    .where("at", ">=", guess).orderBy("at", "desc").limit(20).get();
  return snap.docs.some(d => {
    const s = d.data();
    if (s.completed === false) return false;
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit" });
    const p = Object.fromEntries(f.formatToParts(new Date(s.at)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}` === dayKey;
  });
}

async function run(){
  const snap = await db.collection("reminders").where("enabled", "==", true).get();
  console.log(`مشتركون: ${snap.size}`);
  let sent = 0, skipped = 0;

  for (const doc of snap.docs){
    const r = doc.data();
    if (!r.token) { skipped++; continue; }
    const tz = r.tz || "Asia/Riyadh";
    let now;
    try { now = localNow(tz); }
    catch(e){ now = localNow("Asia/Riyadh"); }

    const want = (+r.hour || 18) * 60 + (+r.minute || 0);
    if (Math.abs(now.minutes - want) > WINDOW_MIN){ skipped++; continue; }
    if (r.lastSent === now.dayKey){ skipped++; continue; }

    try {
      if (await trainedToday(doc.id, now.dayKey, tz)){
        await doc.ref.update({ lastSent: now.dayKey, lastSkip: "trained" });
        skipped++; continue;
      }
    } catch(e){ console.error("sessions", doc.id, e.message); }

    let streak = 0;
    try {
      const p = await db.collection("profiles").doc(doc.id).get();
      if (p.exists) streak = +p.data().streak || 0;
    } catch(e){}

    const t = TXT[r.lang === "en" ? "en" : "ar"];
    const body = streak > 1 ? t.streak(streak) : t.plain;

    try {
      await fcm.send({
        token: r.token,
        data: { title: t.title, body, lang: r.lang === "en" ? "en" : "ar",
                dir: r.lang === "en" ? "ltr" : "rtl", url: "https://www.mountains-fit.online/" },
        webpush: {
          headers: { Urgency: "high", TTL: "3600" },
          notification: {
            title: t.title, body,
            icon: "https://www.mountains-fit.online/icon-192.png",
            badge: "https://www.mountains-fit.online/icon-192.png",
            tag: "hejaz-daily"
          },
          fcmOptions: { link: "https://www.mountains-fit.online/" }
        }
      });
      await doc.ref.update({ lastSent: now.dayKey, lastSkip: "" });
      sent++;
      console.log(`أُرسل إلى ${r.name || doc.id} (${pad(r.hour)}:${pad(r.minute)} ${tz})`);
    } catch(err){
      console.error("فشل الإرسال", doc.id, err.code || err.message);
      if (/registration-token-not-registered|invalid-argument/.test(err.code || "")){
        await doc.ref.update({ enabled: false, lastSkip: "bad-token" });
      }
    }
  }
  console.log(`تم: أُرسل ${sent} · تُخطّي ${skipped}`);
}

run().catch(e => { console.error(e); process.exit(1); });
