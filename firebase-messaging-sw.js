/* ============================================================
   نادي الجبال — عامل الخدمة الخاص بالإشعارات
   بدون أي مكتبات خارجية: يقرأ رسالة الدفع مباشرة ويعرضها
   ============================================================ */
const ICON = "./icon-192.png";
const HOME = "https://www.mountains-fit.online/";

/* ============================================================
   التخزين: «الشبكة أولاً» — التحديث يصل فوراً، والنسخة المخزّنة
   احتياط عند انقطاع الاتصال أو بطئه.
   ============================================================ */
const CACHE = "hejaz-shell-v1";
const SLOW  = 3500;                       // ننتظر الشبكة هذا القدر ثم نرجع للمخزّن
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./ex.js", "./i18n.js",
  "./social.js", "./progress.js", "./share.js", "./push.js",
  "./firebase-config.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable.png", "./hero.jpg"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch(e){ return; }
  if (url.origin !== self.location.origin) return;    // فايربيس والخطوط تمرّ كما هي

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });

    const net = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });

    if (!hit) return net;                             // لا نسخة مخزّنة: ننتظر الشبكة
    try {
      return await Promise.race([
        net,
        new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), SLOW))
      ]);
    } catch(e){
      return hit;                                     // الشبكة بطيئة أو مقطوعة
    }
  })());
});

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
