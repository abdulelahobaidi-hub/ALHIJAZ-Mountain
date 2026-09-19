/* ============================================================
   نادي الجبال — عامل الخدمة الخاص بالإشعارات
   بدون أي مكتبات خارجية: يقرأ رسالة الدفع مباشرة ويعرضها
   ============================================================ */
const ICON = "./icon-192.png";
const HOME = "https://www.mountains-fit.online/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let raw = {};
  try { raw = event.data ? event.data.json() : {}; }
  catch (e) {
    try { raw = { data: { body: event.data ? event.data.text() : "" } }; } catch (_) { raw = {}; }
  }
  const d = raw.data || {};
  const n = raw.notification || {};
  const title = d.title || n.title || "نادي الجبال";
  const body  = d.body  || n.body  || "";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: n.icon || ICON,
    badge: n.badge || ICON,
    tag: d.tag || n.tag || "hejaz-daily",
    renotify: true,
    dir: d.dir === "ltr" ? "ltr" : "rtl",
    lang: d.lang || "ar",
    data: { url: d.url || (raw.fcmOptions && raw.fcmOptions.link) || HOME }
  }));
});

/* فتح التطبيق عند الضغط على الإشعار */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || HOME;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list){
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
