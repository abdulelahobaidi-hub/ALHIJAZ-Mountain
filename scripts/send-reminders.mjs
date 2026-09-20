/* ============================================================
   نادي الجبال — إرسال التذكير اليومي
   يشتغل على GitHub Actions كل ربع ساعة ويرسل لمن حان وقته
   ============================================================ */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const WINDOW_MIN = 8;                 // نافذة التطابق حول الوقت المطلوب
const WARN_HOUR  = 21;                // تنبيه «سلسلتك على وشك الانكسار» بتوقيت المستخدم
const WARN_MIN_STREAK = 2;            // لا ننبّه إلا من عنده سلسلة قائمة
const WARN_GAP_MIN = 90;              // لا ننبّه من تذكيره قريب من هذا الوقت

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
    streak: n => `وقت التمرين 💪 — لا تكسر سلسلتك (${n} ${n === 1 ? "يوم" : "أيام"})`,
    warn:   n => `سلسلتك ${n} ${n === 1 ? "يوم" : "أيام"} 🔥 — باقي ساعات على نهاية اليوم`
  },
  en: {
    title: "Mountains Club",
    plain: "Time to train 💪",
    streak: n => `Time to train 💪 — keep your ${n}-day streak alive`,
    warn:   n => `Your ${n}-day streak 🔥 — a few hours left today`
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

async function push(r, title, body, tag){
  await fcm.send({
    token: r.token,
    data: { title, body, lang: r.lang === "en" ? "en" : "ar",
            dir: r.lang === "en" ? "ltr" : "rtl", url: "https://www.mountains-fit.online/" },
    webpush: {
      headers: { Urgency: "high", TTL: "3600" },
      notification: {
        title, body,
        icon: "https://www.mountains-fit.online/icon-192.png",
        badge: "https://www.mountains-fit.online/icon-192.png",
        tag
      },
      fcmOptions: { link: "https://www.mountains-fit.online/" }
    }
  });
}

async function streakOf(uid){
  try {
    const p = await db.collection("profiles").doc(uid).get();
    return p.exists ? (+p.data().streak || 0) : 0;
  } catch(e){ return 0; }
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
    const inDaily = Math.abs(now.minutes - want) <= WINDOW_MIN && r.lastSent !== now.dayKey;
    const inWarn  = Math.abs(now.minutes - WARN_HOUR * 60) <= WINDOW_MIN
                 && r.lastWarn !== now.dayKey
                 && Math.abs(want - WARN_HOUR * 60) > WARN_GAP_MIN;   // لا نزدوج مع تذكيره
    if (!inDaily && !inWarn){ skipped++; continue; }

    let trained = false;
    try { trained = await trainedToday(doc.id, now.dayKey, tz); }
    catch(e){ console.error("sessions", doc.id, e.message); }

    const t = TXT[r.lang === "en" ? "en" : "ar"];

    /* ① التذكير اليومي في وقته */
    if (inDaily){
      if (trained){
        await doc.ref.update({ lastSent: now.dayKey, lastSkip: "trained" });
        skipped++; continue;
      }
      const streak = await streakOf(doc.id);
      const body = streak > 1 ? t.streak(streak) : t.plain;
      try {
        await push(r, t.title, body, "hejaz-daily");
        await doc.ref.update({ lastSent: now.dayKey, lastSkip: "" });
        sent++;
        console.log(`تذكير إلى ${r.name || doc.id} (${pad(r.hour)}:${pad(r.minute)} ${tz})`);
      } catch(err){ await onFail(doc, err); }
      continue;
    }

    /* ② تنبيه قبل انكسار السلسلة — مساءً لمن سلسلته قائمة ولم يتمرّن */
    if (trained){
      await doc.ref.update({ lastWarn: now.dayKey });
      skipped++; continue;
    }
    const streak = await streakOf(doc.id);
    if (streak < WARN_MIN_STREAK){
      await doc.ref.update({ lastWarn: now.dayKey });
      skipped++; continue;
    }
    try {
      await push(r, t.title, t.warn(streak), "hejaz-streak");
      await doc.ref.update({ lastWarn: now.dayKey });
      sent++;
      console.log(`تنبيه سلسلة (${streak}) إلى ${r.name || doc.id} — ${tz}`);
    } catch(err){ await onFail(doc, err); }
  }
  console.log(`تم: أُرسل ${sent} · تُخطّي ${skipped}`);
}

async function onFail(doc, err){
  console.error("فشل الإرسال", doc.id, err.code || err.message);
  if (/registration-token-not-registered|invalid-argument/.test(err.code || "")){
    await doc.ref.update({ enabled: false, lastSkip: "bad-token" });
  }
}

run().catch(e => { console.error(e); process.exit(1); });
