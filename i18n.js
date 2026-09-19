/* ============================================================
   نادي جبال الحجاز — اللغة  |  Hijaz Mountains Club — language
   العربية هي لغة المصدر؛ الإنجليزية من هذا القاموس
   ============================================================ */
const KEY = "hejaz.lang";
let LANG = "ar";
try { if (localStorage.getItem(KEY) === "en") LANG = "en"; } catch(e){}

export const lang    = () => LANG;
export const isEn    = () => LANG === "en";
export const LOC     = () => LANG === "en" ? "en-GB" : "ar-SA-u-nu-latn-ca-gregory";
export const SPEECH  = () => LANG === "en" ? "en-US" : "ar-SA";

export function L(s, ...a){
  let out = (LANG === "en" && EN[s] != null) ? EN[s] : s;
  if (a.length) out = String(out).replace(/\{(\d+)\}/g, (m, i) => a[i] == null ? "" : a[i]);
  return out;
}

export function setLang(v){
  try { localStorage.setItem(KEY, v === "en" ? "en" : "ar"); } catch(e){}
  location.reload();
}

/* يترجم نصوص الصفحة الثابتة مرة واحدة عند الإقلاع */
export function translateStatic(){
  const root = document.body;
  document.documentElement.lang = LANG === "en" ? "en" : "ar";
  document.documentElement.dir  = LANG === "en" ? "ltr" : "rtl";
  if (LANG !== "en" || !root) return;

  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const jobs = [];
  while (w.nextNode()){
    const n = w.currentNode, t = n.nodeValue.trim();
    if (t && EN[t] != null) jobs.push([n, n.nodeValue.replace(t, EN[t])]);
  }
  jobs.forEach(([n, v]) => { n.nodeValue = v; });

  const attrs = ["placeholder","aria-label","title","alt"];
  root.querySelectorAll("[placeholder],[aria-label],[title],[alt]").forEach(el => {
    attrs.forEach(a => {
      const v = el.getAttribute(a);
      if (v && EN[v.trim()] != null) el.setAttribute(a, EN[v.trim()]);
    });
  });
  if (EN["نادي جبال الحجاز"]) document.title = EN["نادي جبال الحجاز"];
}

/* ============================================================
   القاموس
   ============================================================ */
const EN = {
  /* ---- الهوية ---- */
  "نادي جبال الحجاز": "Hijaz Mountains Club",
  "جبال الحجاز": "Hijaz Mountains",
  "نادي جبال الحجاز — مؤقت تمارين وجداول رياضية ومتابعة الاستمرارية":
    "Hijaz Mountains Club — interval timer, workout plans and streak tracking",
  "كل تمرين خطوة في الطريق. سجّل دخولك وابدأ الصعود.":
    "Every workout is a step on the path. Sign in and start climbing.",
  "تسجيل الدخول بحساب جوجل": "Sign in with Google",
  "أكمل بدون حساب على هذا الجهاز": "Continue without an account on this device",

  /* ---- مكتبة التمارين ---- */
  "نط الحبل": "Jump rope",
  "إيقاع ثابت، الكتفين مرتخية": "Steady rhythm, shoulders relaxed",
  "بوش اب": "Push-ups",
  "الجسم خط مستقيم من الكعب للرأس": "Body in a straight line from heel to head",
  "ضغط أكتاف": "Shoulder press",
  "شدّ البطن ولا تقوّس ظهرك": "Brace your core, don't arch your back",
  "بلانك": "Plank",
  "ثبّت الحوض، لا ترفع ردفك": "Keep your hips level, don't lift them",
  "سكوات": "Squats",
  "الكعب ثابت على الأرض": "Heels flat on the floor",
  "لانجز": "Lunges",
  "الركبة الأمامية فوق الكاحل": "Front knee over the ankle",
  "متسلق الجبل": "Mountain climbers",
  "الحوض منخفض والإيقاع سريع": "Hips low, pace quick",
  "بيربي": "Burpees",
  "نزول ودفع وقفزة — نفس منتظم": "Drop, push, jump — steady breathing",
  "تمارين البطن": "Crunches",
  "ارفع بالبطن لا بالرقبة": "Lift with your abs, not your neck",
  "جسر الورك": "Hip bridge",
  "اعصر المؤخرة في الأعلى": "Squeeze your glutes at the top",
  "قفز الفتح والضم": "Jumping jacks",
  "نزول خفيف على مشط القدم": "Land softly on the balls of your feet",
  "تمديد الظهر": "Back extension",
  "ارفع الصدر ببطء": "Lift your chest slowly",

  "بنش برس": "Bench press",
  "نزّل للصدر ببطء وادفع بثبات": "Lower to the chest slowly, press steadily",
  "سكوات بار": "Barbell squat",
  "الظهر مستقيم والكعب ثابت": "Back straight, heels down",
  "ديدليفت": "Deadlift",
  "ارفع بالورك والظهر محايد": "Drive with the hips, spine neutral",
  "سحب أمامي": "Lat pulldown",
  "اسحب للصدر واعصر اللوح": "Pull to the chest, squeeze the shoulder blades",
  "تجديف بالدمبل": "Dumbbell row",
  "اسحب للخصر والمرفق قريب": "Pull to the waist, elbow close in",
  "ضغط أكتاف دمبل": "Dumbbell shoulder press",
  "رفرفة جانبي": "Lateral raise",
  "ارفع لمستوى الكتف فقط": "Raise to shoulder height only",
  "بايسبس بار": "Barbell curl",
  "المرفق ثابت بجنبك": "Elbows fixed at your sides",
  "ترايسبس كيبل": "Cable triceps pushdown",
  "مدّ الذراع كاملاً": "Extend the arm fully",
  "دفع أرجل": "Leg press",
  "لا تقفل الركبة في الأعلى": "Don't lock your knees at the top",
  "مرجحة كيتل بيل": "Kettlebell swing",
  "الدفع من الورك لا من الذراع": "Drive from the hips, not the arms",
  "سمانة واقف": "Standing calf raise",
  "ارتفاع كامل وثبات ثانية": "Full height, hold for a second",

  /* ---- الجدول والمؤقت ---- */
  "جدول عبدالاله الرياضي": "Abdulelah's Workout",
  "نعم، احذف": "Yes, delete",
  "إحماء": "Warm-up",
  "الإحماء": "Warm-up",
  "إحماء وتدوير مفاصل": "Warm-up and joint rotations",
  "ارفع نبضك بالتدريج": "Raise your heart rate gradually",
  "ركّز على الأداء الصحيح": "Focus on good form",
  "الجولة {0} من {1}": "Round {0} of {1}",
  "راحة": "Rest",
  "استعد": "Get ready",
  "تنفّس عميق": "Breathe deep",
  "تهدئة": "Cool-down",
  "التهدئة": "Cool-down",
  "إطالة": "Stretching",
  "أطل كل عضلة ٢٠ ثانية": "Stretch each muscle for 20 seconds",
  "جاهز": "Ready",
  "اضغط ابدأ": "Tap start",
  "نغمة التنبيه": "Beep on change",
  "صوت يقرأ التمرين": "Speak the exercise",
  "التالي": "Next",
  "إنهاء": "End",

  /* ---- السحابة والدخول ---- */
  "تعذّر تحميل بياناتك من السحابة": "Couldn't load your data from the cloud",
  "انحفظ محلياً — تعذّر الحفظ في السحابة": "Saved locally — couldn't save to the cloud",
  "انحذف محلياً — تعذّر الحذف من السحابة": "Deleted locally — couldn't delete from the cloud",
  "إعدادات Firebase غير مكتملة — افتح ملف firebase-config.js والصق بيانات مشروعك.":
    "Firebase settings are incomplete — open firebase-config.js and paste your project details.",
  "جارٍ فتح نافذة جوجل…": "Opening the Google window…",
  "تعذّر تسجيل الدخول: ": "Sign-in failed: ",
  "لتفعيل المزامنة بين أجهزتك: أنشئ مشروع Firebase والصق بياناته في firebase-config.js":
    "To sync across your devices: create a Firebase project and paste its details into firebase-config.js",
  "صديق الجبال": "Mountain friend",
  "تعذّر تحميل Firebase — تأكد من الاتصال بالإنترنت.":
    "Couldn't load Firebase — check your internet connection.",
  "ضيف": "Guest",
  "ض": "G",
  "؟": "?",
  "الحساب": "Account",
  "أهلاً ": "Hi ",
  "وضع محلي على هذا الجهاز": "Local mode on this device",

  /* ---- السلسلة والتجميد ---- */
  "استخدمنا تجميداً — سلسلتك محفوظة ❄️": "Used a freeze — your streak is safe ❄️",
  "استخدمنا {0} تجميدات — سلسلتك محفوظة ❄️": "Used {0} freezes — your streak is safe ❄️",
  "تجميد": "a freeze",
  " تجميدات": " freezes",
  "تجميدات": "freezes",
  "كسبت {0} ❄️": "You earned {0} ❄️",
  "❄️ تكسب تجميداً كل ٧ أيام": "❄️ A freeze every 7 days",
  "ابدأ اليوم وخلّ العدّاد يمشي": "Start today and keep the counter moving",
  "أنجزت تمرين اليوم — استمر": "Today's workout is done — keep going",
  "درّب اليوم عشان ما تنكسر السلسلة": "Train today so your streak stays alive",
  "أيام متتالية": "day streak",
  "ح": "S", "ن": "M", "ث": "T", "ر": "W", "خ": "T", "ج": "F", "س": "S",

  /* ---- الرئيسية ---- */
  "تمرين اليوم": "Today's workout",
  "المدة {0} · {1} جولة": "{0} · {1} rounds",
  "لا يوجد جدول": "No plan yet",
  "أنشئ جدولك الأول من تبويب الجداول": "Create your first plan from the Plans tab",
  "ابدأ التمرين": "Start workout",
  "تمرين مكتمل": "workouts",
  "أطول سلسلة": "Best streak",
  "دقيقة تدريب": "minutes",

  /* ---- الجداول والبناء ---- */
  "الجداول": "Plans",
  "المدة": "",
  "جولة": "rounds",
  "{0} جولة": "{0} rounds",
  "تعديل": "Edit",
  "عرض المزيد ({0})": "Show more ({0})",
  "عرض المزيد": "Show more",
  "تعديل الجدول": "Edit plan",
  "جدول جديد": "New plan",
  "اسم الجدول": "Plan name",
  "مثال: جدول الصباح": "e.g. Morning plan",
  "المدة المستهدفة": "Target duration",
  "10 دقائق": "10 minutes",
  "15 دقيقة": "15 minutes",
  "20 دقيقة": "20 minutes",
  "25 دقيقة": "25 minutes",
  "30 دقيقة": "30 minutes",
  "45 دقيقة": "45 minutes",
  "بدون تحديد": "No target",
  "تكرار المجموعة": "Repeat the set",
  "مرة واحدة": "Once",
  "مرتين": "Twice",
  "٣ مرات": "3 times",
  "٤ مرات": "4 times",
  "٥ مرات": "5 times",
  "بدون": "None",
  "دقيقة واحدة": "1 minute",
  "دقيقتان": "2 minutes",
  "٣ دقائق": "3 minutes",
  "مدة الجدول": "Plan duration",
  "التمارين": "Exercises",
  "الجدول فاضي. اختر تمريناً من الأسفل.": "This plan is empty. Pick an exercise below.",
  "أضف تمريناً": "Add an exercise",
  "بالوقت": "By time",
  "بالأوزان": "With weights",
  "تمرين من عندك": "Your own exercise",
  "اسم التمرين": "Exercise name",
  "احفظ الجدول": "Save plan",
  "احذف الجدول": "Delete plan",
  "كجم": "kg",
  "مجموعات": "Sets",
  "عدّات": "Reps",
  "عمل": "Work",
  "أعلى": "Up",
  "أسفل": "Down",
  "حذف": "Delete",
  "حجم الرفع {0} كجم": "Lifting volume {0} kg",
  "{0} جولة — بدون مدة مستهدفة": "{0} rounds — no target duration",
  "أضف تمارين للجدول": "Add exercises to the plan",
  "مطابق للمدة المستهدفة ({0} دقيقة)": "Matches your {0}-minute target",
  "أطول من المستهدف بـ {0} دقيقة": "{0} longer than your target",
  "ناقص {0} دقيقة عن المستهدف": "{0} short of your target",
  "جدول بدون اسم": "Untitled plan",
  "أضف تمريناً واحداً على الأقل": "Add at least one exercise",
  "انحفظ الجدول": "Plan saved",
  "الجدول فاضي": "This plan is empty",

  /* ---- شاشة التمرين ---- */
  "تم": "Done",
  "اكتمل التمرين": "Workout complete",
  "{0} · المجموعة {1} من {2}": "{0} · Set {1} of {2}",
  "انحفظ في سجلك": "Saved to your log",
  "عدّة — اضغط «تم» بعد ما تخلّص المجموعة": "reps — tap Done when you finish the set",
  "متوقف": "Paused",
  "بعده: <b>": "Next: <b>",
  "باقي {0} من {1}": "{0} left of {1}",
  "من جديد": "Again",
  "إيقاف": "Pause",
  "أكمل": "Resume",
  "ابدأ": "Start",
  "أنقص الوزن": "Decrease weight",
  "زد الوزن": "Increase weight",
  "راحة، بعدها {0}": "Rest, then {0}",
  "، {0} كيلو": ", {0} kilos",
  "{0}، {1} عدة{2}": "{0}, {1} reps{2}",
  "رفعت {0} كجم في هذا التمرين 💪": "You lifted {0} kg in this workout 💪",
  "ممتاز — {0} أيام متتالية": "Great — {0} days in a row",
  "أحسنت، انحفظ التمرين": "Well done, workout saved",
  "انحفظ {0} من {1} جولة": "Saved {0} of {1} rounds",
  "تمام": "OK",

  /* ---- السجل ---- */
  "السجل": "Log",
  "{0} تمرين": "{0} workouts",
  "احذف هذا التمرين": "Delete this workout",
  "تمرين": "Workout",
  "حذف التمرين": "Delete workout",
  "{0} — {1}. الحذف يؤثر على عدّاد الأيام المتتالية.":
    "{0} — {1}. Deleting affects your streak count.",
  "انحذف التمرين من السجل": "Workout deleted from your log",
  "حذف الجدول": "Delete plan",
  "هذا الجدول": "this plan",
  "{0} — ما راح يظهر في قائمة الجداول.": "{0} — it won't appear in your plans list.",
  "انحذف الجدول": "Plan deleted",
  "إنهاء التمرين": "End workout",
  "اللي أنجزته ينحفظ في السجل.": "What you've done will be saved to your log.",
  "أنهِ التمرين": "End workout",
  "ما في تمارين مسجّلة بعد.": "No workouts logged yet.",

  /* ---- الحساب ---- */
  "بدون بريد": "No email",
  "رقم عضويتك {0} — بياناتك تتزامن بين أجهزتك.":
    "Your member ID is {0} — your data syncs across your devices.",
  "بياناتك محفوظة في حسابك وتتزامن بين أجهزتك.":
    "Your data is saved to your account and syncs across devices.",
  "وضع محلي — البيانات على هذا الجهاز فقط. سجّل بجوجل للمزامنة.":
    "Local mode — data stays on this device. Sign in with Google to sync.",
  "تسجيل الخروج": "Sign out",
  "رجوع لشاشة الدخول": "Back to sign-in",
  "إغلاق": "Close",
  "تأكيد": "Confirm",
  "إلغاء": "Cancel",
  "رجوع": "Back",

  /* ---- الوقت ---- */
  "الحين": "now",
  "قبل {0} دقيقة": "{0} min ago",
  "قبل {0} ساعة": "{0} h ago",
  "قبل {0} يوم": "{0} d ago",
  "دقيقة": "min",

  /* ---- النادي: الأصدقاء ---- */
  "الرئيسية": "Home",
  "النادي": "Club",
  "التقدّم": "Progress",
  "الأصدقاء": "Friends",
  "طلبات صداقة": "Friend requests",
  "أضف صديق": "Add friend",
  "اكتب رقم عضوية صديقك (٦ أرقام) — يوصله طلب يقبله أو يرفضه":
    "Enter your friend's member ID (6 digits) — they'll get a request to accept or decline",
  "رقم العضوية ٦ أرقام": "A member ID is 6 digits",
  "ما فيه عضو بهذا الرقم": "No member with that ID",
  "هذا رقمك أنت": "That's your own ID",
  "هو أصلاً في قائمة أصدقائك": "They're already in your friends list",
  "انرسل الطلب — ينتظر قبوله": "Request sent — waiting for them to accept",
  "تعذّر إرسال الطلب": "Couldn't send the request",
  "صرتوا أصدقاء — {0}": "You're friends now — {0}",
  "تعذّر القبول": "Couldn't accept",
  "انرفض الطلب": "Request declined",
  "تعذّر الرفض": "Couldn't decline",
  "حذف صديق": "Remove friend",
  "{0} راح ينحذف من قائمتك.": "{0} will be removed from your list.",
  "انحذف": "Removed",
  "تعذّر الحذف": "Couldn't remove",
  "ما عندك أصدقاء بعد. أضف صديق برقم عضويته.":
    "No friends yet. Add one with their member ID.",
  "رقم عضويتك": "Your member ID",
  "رقم العضوية": "Member ID",
  "انسخ الرقم": "Copy ID",
  "انتسخ الرقم": "ID copied",
  "رقمك: ": "Your ID: ",
  "{0} جديد": "{0} new",
  "عضو": "member",
  "قبول": "Accept",
  "رفض": "Decline",
  "هذا الأسبوع": "This week",
  "تمرين هذا الأسبوع": "this week",
  "محادثة": "Chat",
  "المحادثة": "Chat",
  "سجّل دخولك أولاً": "Sign in first",
  "سجّل دخولك عشان تضيف أصدقاء.": "Sign in to add friends.",
  "سجّل دخولك عشان تنشئ قروب.": "Sign in to create a group.",
  "القروبات تحتاج حساب": "Groups need an account",
  "سجّل دخولك بجوجل عشان يكون لك رقم عضوية وتقدر تضيف أصدقاء وتنشئ قروبات.":
    "Sign in with Google to get a member ID, add friends and create groups.",

  /* ---- النادي: القروبات ---- */
  "القروبات": "Groups",
  "قروب": "Group",
  "قروب جديد": "New group",
  "وش اسم القروب؟": "What's the group called?",
  "اكتب اسم القروب": "Enter a group name",
  "انضم بكود": "Join by code",
  "انضم لقروب": "Join a group",
  "اكتب كود الدعوة (٦ خانات)": "Enter the invite code (6 characters)",
  "انشأ القروب — كود الدعوة {0}": "Group created — invite code {0}",
  "تعذّر إنشاء القروب — تأكد من قواعد Firestore":
    "Couldn't create the group — check your Firestore rules",
  "الكود ٦ خانات": "The code is 6 characters",
  "كود غير صحيح": "Invalid code",
  "انضممت للقروب": "You joined the group",
  "تعذّر الانضمام": "Couldn't join",
  "ما أنت في أي قروب. أنشئ قروب أو انضم بكود من صديق.":
    "You're not in a group yet. Create one, or join with a friend's code.",
  "مغادرة القروب": "Leave group",
  "{0} — تقدر ترجع بنفس الكود.": "{0} — you can come back with the same code.",
  "غادر": "Leave",
  "غادرت القروب": "You left the group",
  "تعذّرت المغادرة": "Couldn't leave",
  "أعضاء": "members",
  "كود": "Code",
  " · أنت مشرف": " · admin",
  "مشرف": "Admin",
  "صورة القروب": "Group photo",
  "شارك كود الدعوة": "Share invite code",
  "اسم القروب": "Group name",
  "اكتب الاسم الجديد": "Type the new name",
  "انحفظ الاسم": "Name saved",
  "تعذّر التعديل": "Couldn't save the change",
  "انحفظت الصورة": "Photo saved",
  "تعذّر حفظ الصورة": "Couldn't save the photo",
  "انضم لقروب «": "Join the group “",
  "في نادي جبال الحجاز": "on Hijaz Mountains Club",
  "الكود:": "Code:",
  "انتسخت الدعوة": "Invite copied",
  "جارٍ التحميل…": "Loading…",
  "ما فيه أعضاء بعد.": "No members yet.",
  " (أنت)": " (you)",
  " · آخر تمرين ": " · last ",
  "آخر تمرين ": "Last workout ",
  "خيارات": "Options",
  "الترتيب": "Ranking",

  /* ---- التحدي ---- */
  "التحدي": "Challenge",
  "غيّر الهدف": "Change goal",
  "تحدي هذا الأسبوع": "This week's challenge",
  "تمارين لكل عضو": "workouts per member",
  "من": "of",
  "خلّصوا التحدي": "finished the challenge",
  "هدف التحدي": "Challenge goal",
  "كم تمرين لكل عضو في الأسبوع؟": "How many workouts per member each week?",
  "رقم بين ١ و ٣٠": "A number between 1 and 30",
  "انحفظ الهدف": "Goal saved",
  "تعذّر الحفظ": "Couldn't save",
  "بدأ التحدي — أسبوع من الحين": "Challenge started — one week from now",
  "تعذّر بدء التحدي": "Couldn't start the challenge",
  "تحدَّه أسبوعاً": "Challenge for a week",
  "تعادل": "Tied",
  "فزت 🎉": "You won 🎉",
  "فاز {0}": "{0} won",
  "يوم": "day",
  "أيام": "days",
  "باقي {0} {1}": "{0} {1} left",
  "تحدي الأسبوع": "Week challenge",
  "أنت": "You",
  "خلّص {0} — {1} جولة": "Finished {0} — {1} rounds",

  /* ---- المحادثة ---- */
  "اكتب رسالة…": "Write a message…",
  "إرسال": "Send",
  "ما انرسلت الرسالة": "Message not sent",
  "ابدأ المحادثة — أول رسالة عليك.": "Start the chat — the first message is on you.",
  "تعذّر تحميل المحادثة — تأكد من نشر قواعد":
    "Couldn't load the chat — make sure you published the rules",
  "ابدأ المحادثة مع": "Start a chat with",

  /* ---- الجداول المشتركة ---- */
  "انشر جدولاً للقروب": "Share a plan with the group",
  "انشر جدولاً": "Share a plan",
  "شارك جدولاً": "Share a plan",
  "انسخه لي": "Copy to me",
  "ما فيه جداول منشورة بعد.": "No plans shared yet.",
  "انتشر الجدول للقروب": "Plan shared with the group",
  "تعذّر النشر": "Couldn't share",
  " (من ": " (from ",
  "انضاف لجداولك": "Added to your plans",
  "انرسل الجدول": "Plan sent",

  /* ---- إدارة الأعضاء ---- */
  "افتح ملفه": "Open profile",
  "أرسل طلب صداقة": "Send friend request",
  "أزل الإشراف": "Remove admin",
  "اجعله مشرفاً": "Make admin",
  "أزله من القروب": "Remove from group",
  "انرسل طلب صداقة لـ {0}": "Friend request sent to {0}",
  "{0} صار مشرفاً": "{0} is now an admin",
  "انسحب الإشراف من {0}": "{0} is no longer an admin",
  "إزالة عضو": "Remove member",
  "{0} راح ينحذف من {1}. يقدر يرجع بالكود.":
    "{0} will be removed from {1}. They can rejoin with the code.",
  "أزله": "Remove",
  "انحذف {0} من القروب": "{0} was removed from the group",
  "تعذّرت الإزالة": "Couldn't remove",

  /* ---- ملف الصديق ---- */
  "ملف الصديق": "Friend profile",
  "ملفه": "Profile",
  "حذف من الأصدقاء": "Remove friend",
  "جداوله": "Their plans",
  "{0} (من {1})": "{0} (from {1})",
  "ما سجّل تمارين بعد": "No workouts logged yet",
  "· 🏅 {0} شارة": "· 🏅 {0} badges",
  "ما نشر جداول بعد.": "No plans shared yet.",

  /* ---- الشارات ---- */
  "الشارات": "Badges",
  "{0} من {1}": "{0} of {1}",
  "أول خطوة": "First step",
  "أول تمرين مكتمل": "First completed workout",
  "عشرة": "Ten",
  "١٠ تمارين": "10 workouts",
  "خمسين": "Fifty",
  "٥٠ تمريناً": "50 workouts",
  "مئة": "Hundred",
  "١٠٠ تمرين": "100 workouts",
  "أسبوع متواصل": "Full week",
  "٧ أيام متتالية": "7 days in a row",
  "أسبوعان": "Two weeks",
  "١٤ يوماً متتالياً": "14 days in a row",
  "شهر كامل": "A full month",
  "٣٠ يوماً متتالياً": "30 days in a row",
  "قمة الحجاز": "Hijaz summit",
  "١٠٠ يوم متتالٍ": "100 days in a row",
  "٥٠٠ دقيقة": "500 minutes",
  "٥٠٠ دقيقة تدريب": "500 minutes of training",
  "٢٠٠٠ دقيقة": "2000 minutes",
  "٢٠٠٠ دقيقة تدريب": "2000 minutes of training",
  "أسبوع بلا راحة": "No rest week",
  "٧ أيام تدريب في أسبوع": "7 training days in one week",
  "قبل الفجر": "Before dawn",
  "تمرين قبل ٧ صباحاً": "A workout before 7am",
  "بومة الليل": "Night owl",
  "تمرين بعد ١١ مساءً": "A workout after 11pm",
  "أول طن": "First tonne",
  "١٠٠٠ كجم حجم رفع": "1000 kg of lifting volume",
  "عشرة أطنان": "Ten tonnes",
  "١٠٬٠٠٠ كجم حجم رفع": "10,000 kg of lifting volume",

  /* ---- لوحة التقدّم ---- */
  "تمارينك في ١٢ أسبوعاً": "Your workouts over 12 weeks",
  "عدد التمارين لكل أسبوع خلال آخر ١٢ أسبوعاً": "Workouts per week over the last 12 weeks",
  "قبل ١٢ أسبوعاً": "12 weeks ago",
  "يوم راحة محمي": "Protected rest day",
  " تمرين": " workouts",
  "بدون تمرين": "No workout",
  "آخر ١٦ أسبوعاً": "Last 16 weeks",
  "يوم تدريب": "training days",
  "خريطة أيام التدريب في آخر ١٦ أسبوعاً": "Map of training days over the last 16 weeks",
  "أقل": "Less",
  "أكثر": "More",
  "يوم محمي": "Protected day",
  "أكثر جداولك استخداماً": "Your most used plans",
  "أوزانك": "Your lifts",
  "كجم إجمالاً": "kg lifted in total",
  "أفضل": "best",
  "مجموعة": "sets",
  "كجم حجم": "kg volume",
  "هذا الشهر": "This month",
  "دقيقة هذا الشهر": "Minutes this month",
  "معدل الأسبوع": "Weekly average",
  "خلّص أول تمرين ويبدأ التحليل يبني نفسه.":
    "Finish your first workout and the analysis starts building itself.",

  /* ---- اللغة ---- */
  "اللغة": "Language",
  "English": "English",
  "العربية": "العربية"
};
