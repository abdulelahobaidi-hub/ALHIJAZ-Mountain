/* ============================================================
   نادي الجبال — عامل الخدمة الخاص بالإشعارات
   يستقبل تذكير التمرين والتطبيق مقفل
   ============================================================ */
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
importScripts("./firebase-config.js");

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    const d = payload.data || {};
    const title = d.title || "نادي الجبال";
    self.registration.showNotification(title, {
      body: d.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "hejaz-daily",
      renotify: true,
      dir: d.dir === "ltr" ? "ltr" : "rtl",
      lang: d.lang || "ar",
      data: { url: d.url || "./" }
    });
  });
} catch (e) {
  /* بدون إعدادات صحيحة نكتفي بعدم التسجيل */
}

/* فتح التطبيق عند الضغط على الإشعار */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list){
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
