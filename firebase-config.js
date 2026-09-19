/* ============================================================
   إعدادات Firebase — نادي جبال الحجاز
   ------------------------------------------------------------
   1) افتح https://console.firebase.google.com وأنشئ مشروعاً جديداً
      (اقتراح للاسم: hejaz-club)
   2) من Project settings ← Your apps ← اختر أيقونة الويب </>
      وسجّل التطبيق، ثم انسخ قيم firebaseConfig والصقها بالأسفل.
   3) من Build ← Authentication ← Sign-in method: فعّل Google.
   4) من Authentication ← Settings ← Authorized domains: أضف
      abdulelahobaidi-hub.github.io
   5) من Build ← Firestore Database: أنشئ قاعدة بيانات، ثم الصق
      محتوى ملف firestore.rules في تبويب Rules واضغط Publish.

   ملاحظة: هذه القيم ليست سرّية — أمان البيانات يأتي من قواعد
   Firestore التي تمنع أي مستخدم من رؤية بيانات غيره.
   ============================================================ */

const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT",
  storageBucket: "PASTE_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
