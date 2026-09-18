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
  apiKey: "AIzaSyCZP6kXrSj9TxncWISuA81Y_TQ_dzwqDvw",
  authDomain: "alhijaz-mountain.firebaseapp.com",
  projectId: "alhijaz-mountain",
  storageBucket: "alhijaz-mountain.firebasestorage.app",
  messagingSenderId: "842612825589",
  appId: "1:842612825589:web:183069a32d54d1bcb514bc"
};
