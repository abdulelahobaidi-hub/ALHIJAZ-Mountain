/* ============================================================
   نادي الجبال — العادات اليومية
   ▸ قائمة تحقق يومية، ولكل عادة سلسلة أيام خاصة بها
   ▸ خاصة تماماً: تُحفظ في users/{uid}/habits — قواعد الأمان
     تمنع أي أحد غير صاحبها من قراءتها، ولا تُنشر في الملف العام
   ▸ الإحصائيات في نفس الصفحة، تحت القائمة
   ============================================================ */

import { L, LOC } from "./i18n.js";

let C = null;
export function initHabits(ctx){ C = ctx; wire(); }

export const HABITS_LK = "hejaz.habits";

const NAME_MAX = 32;
const DAYS_KEEP = 1000;           // أقصى عدد أيام محفوظة لكل عادة
const WINDOW = 30;                // نافذة الإحصائيات بالأيام
const DAY = 86400000;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function lsGet(k, fb){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e){ return fb; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

/* ---------------- التواريخ ---------------- */
const today0  = () => { const x = new Date(); x.setHours(0,0,0,0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const key     = d => C.dayKey(d);
const fromKey = k => { const [y,m,d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const createdDay = h => { const x = new Date(h.createdAt || Date.now()); x.setHours(0,0,0,0); return x; };

/* ---------------- اختيارات جاهزة ---------------- */
const EMOJIS = ["💧","📖","🚶","🏃","🧘","😴","🥗","🍎","☕","📵","🤲","🕌",
                "✍️","🧠","💊","🦷","🌅","🧹","💰","🎯","🎸","🌱","❤️","⭐"];
const STARTERS = [
  { emoji:"💧", name:"شرب ٨ أكواب ماء" },
  { emoji:"📖", name:"قراءة ١٠ صفحات" },
  { emoji:"🤲", name:"أذكار الصباح" },
  { emoji:"🚶", name:"مشي ١٠ دقائق" },
  { emoji:"😴", name:"النوم قبل ١١" },
  { emoji:"📵", name:"بدون جوال قبل النوم" }
];

/* ============================================================
   التخزين — محلي دائماً، وسحابي عند تسجيل الدخول
   ============================================================ */
function clean(h){
  return {
    id: String(h.id),
    name: String(h.name || "").slice(0, NAME_MAX),
    emoji: String(h.emoji || "⭐").slice(0, 16),
    createdAt: +h.createdAt || Date.now(),
    days: Array.isArray(h.days) ? [...new Set(h.days.filter(k => /^\d{4}-\d\d-\d\d$/.test(k)))].sort().slice(-DAYS_KEEP) : []
  };
}
const sortHabits = () => C.S.habits.sort((a,b) => a.createdAt - b.createdAt);

/* يُستدعى من loadAll بعد التحقق من صاحب النسخة المحلية */
export async function loadHabits(){
  const S = C.S;
  S.habits = lsGet(HABITS_LK, []).map(clean);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try {
      const snap = await m.getDocs(m.collection(db, "users", S.user.uid, "habits"));
      S.habits = snap.docs.map(d => clean({ id:d.id, ...d.data() }));
      lsSet(HABITS_LK, S.habits);
    } catch(err){ console.error("loadHabits", err); }
  }
  sortHabits();
}

async function putHabit(h){
  const S = C.S;
  h = clean(h);
  const i = S.habits.findIndex(x => x.id === h.id);
  if (i >= 0) S.habits[i] = h; else S.habits.push(h);
  sortHabits();
  lsSet(HABITS_LK, S.habits);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    const { id, ...data } = h;
    try { await m.setDoc(m.doc(db, "users", S.user.uid, "habits", id), data); }
    catch(err){ console.error(err); C.toast(L("انحفظ محلياً — تعذّر الحفظ في السحابة")); }
  }
  return h;
}

async function dropHabit(id){
  const S = C.S;
  S.habits = S.habits.filter(h => h.id !== id);
  lsSet(HABITS_LK, S.habits);
  if (S.mode === "cloud" && S.fb){
    const { db, m } = S.fb;
    try { await m.deleteDoc(m.doc(db, "users", S.user.uid, "habits", id)); }
    catch(err){ console.error(err); C.toast(L("انحذف محلياً — تعذّر الحذف من السحابة")); }
  }
}

/* ============================================================
   الحساب
   ============================================================ */
/* السلسلة الحالية: تبقى حيّة طوال اليوم — إن لم تُنجز اليوم بعد
   نعدّ من الأمس، فلا تنكسر إلا إذا انتهى اليوم دون إنجاز */
function streakOf(h){
  const set = new Set(h.days);
  let d = today0();
  if (!set.has(key(d))) d = addDays(d, -1);
  let n = 0;
  while (set.has(key(d))){ n++; d = addDays(d, -1); }
  return n;
}

function bestOf(h){
  let best = 0, run = 0, prev = null;
  for (const k of h.days){                       // مرتبة تصاعدياً
    const d = fromKey(k);
    run = prev && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/* الأيام المحسوبة لعادة داخل النافذة: من يوم إنشائها (أو بداية النافذة)
   حتى اليوم — واليوم لا يُحسب عليها إلا إذا أنجزتها، حتى لا تنخفض
   النسبة صباحاً قبل أن يمرّ الوقت */
function windowOf(h, span = WINDOW){
  const t0 = today0();
  const set = new Set(h.days);
  let from = addDays(t0, -(span - 1));
  const c = createdDay(h);
  if (c > from) from = c;
  let done = 0, total = 0;
  for (let d = new Date(from); d <= t0; d = addDays(d, 1)){
    const k = key(d), isToday = +d === +t0, on = set.has(k);
    if (isToday && !on) continue;
    total++; if (on) done++;
  }
  return { done, total, pct: total ? Math.round(done / total * 100) : null };
}

/* حالة كل يوم في النافذة عبر كل العادات */
function dayFrac(d){
  const k = key(d), isToday = +d === +today0();
  let possible = 0, done = 0;
  for (const h of C.S.habits){
    if (createdDay(h) > d) continue;
    const on = h.days.includes(k);
    if (isToday && !on){ possible++; continue; }
    possible++; if (on) done++;
  }
  return { possible, done };
}

function overall(){
  const t0 = today0();
  let done = 0, total = 0, perfect = 0;
  for (let i = 0; i < WINDOW; i++){
    const d = addDays(t0, -i), isToday = i === 0;
    const f = dayFrac(d);
    if (!f.possible) continue;
    if (f.done === f.possible) perfect++;
    if (isToday){
      /* اليوم: نحسب المُنجز فقط حتى لا تهبط النسبة قبل نهاية اليوم */
      done += f.done; total += f.done;
    } else { done += f.done; total += f.possible; }
  }
  const best = C.S.habits.reduce((a, h) => Math.max(a, bestOf(h)), 0);
  return { pct: total ? Math.round(done / total * 100) : null, perfect, best };
}

/* ============================================================
   العرض
   ============================================================ */
const DAY_SHORT = () => [L("ح"),L("ن"),L("ث"),L("ر"),L("خ"),L("ج"),L("س")];
const DAY_LONG  = () => [L("الأحد"),L("الإثنين"),L("الثلاثاء"),L("الأربعاء"),L("الخميس"),L("الجمعة"),L("السبت")];

function todayCardHTML(){
  const list = C.S.habits, tk = key(today0());
  const n = list.length, done = list.filter(h => h.days.includes(tk)).length;
  const pct = n ? done / n : 0;
  const R = 34, CIRC = +(2 * Math.PI * R).toFixed(2);
  const sub = !n ? "" : done === n ? L("أنجزت كل عاداتك اليوم 🎉")
            : done === 0 ? L("ابدأ بأول عادة")
            : L("باقي {0}", n - done);
  const date = today0().toLocaleDateString(LOC(), { weekday:"long", day:"numeric", month:"long" });
  return `
    <div class="hb-today">
      <svg class="hb-ring" viewBox="0 0 80 80" role="img" aria-label="${esc(L("{0} من {1} اليوم", done, n))}">
        <circle cx="40" cy="40" r="${R}" class="hb-ring-bg"/>
        <circle cx="40" cy="40" r="${R}" class="hb-ring-fg" stroke-dasharray="${CIRC}"
                stroke-dashoffset="${(CIRC * (1 - pct)).toFixed(2)}"/>
        <text x="40" y="40" class="hb-ring-tx" aria-hidden="true">${done}/${n}</text>
      </svg>
      <div class="hb-today-main">
        <span class="eyebrow">${esc(date)}</span>
        <b>${esc(sub)}</b>
        <span class="hb-lock"><svg class="ic"><use href="#i-lock"/></svg>${L("عاداتك خاصة — لا يراها أصدقاؤك")}</span>
      </div>
    </div>`;
}

function listHTML(){
  const t0 = today0(), tk = key(t0);
  const short = DAY_SHORT(), long = DAY_LONG();
  return `<ul class="hb-list">` + C.S.habits.map(h => {
    const set = new Set(h.days);
    const on = set.has(tk);
    const st = streakOf(h);
    let dots = "";
    for (let i = 6; i >= 0; i--){
      const d = addDays(t0, -i), k = key(d), dn = set.has(k);
      const lbl = `${long[d.getDay()]} — ${dn ? L("تمّت") : L("لم تتم")}`;
      dots += `<button class="hb-dot${dn ? " on" : ""}${i === 0 ? " now" : ""}" data-day="${k}"`
            + ` aria-label="${esc(lbl)}" aria-pressed="${dn}">${short[d.getDay()]}</button>`;
    }
    return `
      <li class="hb-item${on ? " done" : ""}" data-id="${esc(h.id)}">
        <button class="hb-check" aria-pressed="${on}"
                aria-label="${esc(h.name)} — ${on ? L("تمّت اليوم") : L("لم تتم اليوم")}">
          <svg class="ic"><use href="#i-check"/></svg>
        </button>
        <div class="hb-main">
          <b class="hb-name"><span class="hb-emo" aria-hidden="true">${esc(h.emoji)}</span>${esc(h.name)}</b>
          <div class="hb-dots">${dots}</div>
        </div>
        <span class="hb-streak${st ? "" : " zero"}" aria-label="${esc(L("سلسلة {0} يوم", st))}">🔥 ${st}</span>
        <button class="hb-edit" aria-label="${esc(L("عدّل العادة"))}"><svg class="ic"><use href="#i-edit"/></svg></button>
      </li>`;
  }).join("") + `</ul>`;
}

function emptyHTML(){
  return `
    <div class="card hb-empty">
      <span class="sheet-ic">✨</span>
      <p class="sheet-name">${L("ابدأ بعادة صغيرة")}</p>
      <p class="sheet-mail">${L("أضف عادات تبي تلتزم فيها يومياً — كل عادة لها سلسلة أيام خاصة فيها، ولا يراها غيرك.")}</p>
      <p class="sheet-label">${L("اقتراحات سريعة")}</p>
      <div class="chips">` + STARTERS.map((s, i) =>
        `<button class="chip hb-starter" data-i="${i}">${s.emoji} ${esc(L(s.name))}</button>`).join("") + `
      </div>
    </div>`;
}

function heatHTML(){
  const t0 = today0();
  const end = addDays(t0, 6 - t0.getDay());               // نهاية الأسبوع (السبت)
  const start = addDays(end, -(5 * 7 - 1));               // خمسة أسابيع كاملة
  const long = DAY_LONG();
  let cells = "";
  for (let d = new Date(start); d <= end; d = addDays(d, 1)){
    const label = d.toLocaleDateString(LOC(), { day:"numeric", month:"long" });
    if (d > t0){ cells += `<i class="hb-hc lf" aria-hidden="true"></i>`; continue; }
    const f = dayFrac(d);
    let cls = "l0", tip = `${long[d.getDay()]} ${label}`;
    if (!f.possible){ cls = "lf"; }
    else {
      const r = f.done / f.possible;
      cls = r === 0 ? "l0" : r < .5 ? "l2" : r < 1 ? "l3" : "l4";
      tip += ` — ${f.done}/${f.possible}`;
    }
    cells += `<i class="hb-hc ${cls}${+d === +t0 ? " now" : ""}" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}"></i>`;
  }
  const heads = DAY_SHORT().map(s => `<span>${s}</span>`).join("");
  return `
    <div class="card hb-heat-card">
      <div class="head-row"><h3>${L("آخر ٥ أسابيع")}</h3>
        <span class="hb-legend" aria-hidden="true"><small>${L("أقل")}</small>
          <i class="hb-hc l0"></i><i class="hb-hc l2"></i><i class="hb-hc l3"></i><i class="hb-hc l4"></i>
          <small>${L("الكل")}</small></span></div>
      <div class="hb-heat-heads" aria-hidden="true">${heads}</div>
      <div class="hb-heat">${cells}</div>
    </div>`;
}

function perHabitHTML(){
  return `<ul class="hb-stats">` + C.S.habits.map(h => {
    const w = windowOf(h), st = streakOf(h), best = bestOf(h);
    const pct = w.pct == null ? 0 : w.pct;
    return `
      <li>
        <div class="hb-st-top">
          <b><span class="hb-emo" aria-hidden="true">${esc(h.emoji)}</span>${esc(h.name)}</b>
          <span class="hb-st-pct">${w.pct == null ? "—" : w.pct + "%"}</span>
        </div>
        <i class="hb-bar" aria-hidden="true"><u style="width:${pct}%"></u></i>
        <div class="hb-st-meta">
          <span>🔥 ${L("الحالية {0}", st)}</span>
          <span>🏆 ${L("الأفضل {0}", best)}</span>
          <span>✅ ${L("{0} من {1} يوم", w.done, w.total)}</span>
        </div>
      </li>`;
  }).join("") + `</ul>`;
}

function statsHTML(){
  const o = overall();
  return `
    <div class="head-row"><h2>${L("إحصائيات العادات")}</h2><span class="count">${L("آخر ٣٠ يوماً")}</span></div>
    <div class="stats">
      <div class="stat"><span class="stat-ic s-rose"><svg class="ic"><use href="#i-check"/></svg></span>
        <strong>${o.pct == null ? "—" : o.pct + "%"}</strong><small>${L("نسبة الالتزام")}</small></div>
      <div class="stat"><span class="stat-ic s-gold"><svg class="ic"><use href="#i-trophy"/></svg></span>
        <strong>${o.perfect}</strong><small>${L("أيام مكتملة")}</small></div>
      <div class="stat"><span class="stat-ic s-plum"><svg class="ic"><use href="#i-flame"/></svg></span>
        <strong>${o.best}</strong><small>${L("أطول سلسلة")}</small></div>
    </div>
    ${heatHTML()}
    ${perHabitHTML()}`;
}

export function renderHabits(){
  const box = $("habitsBox");
  if (!box) return;
  if (!C.S.habits || !C.S.habits.length){
    box.innerHTML = emptyHTML();
  } else {
    box.innerHTML = todayCardHTML() + listHTML() + statsHTML();
  }
  wireBox(box);
}

/* ============================================================
   التفاعل
   ============================================================ */
async function toggleDay(id, k){
  const h = C.S.habits.find(x => x.id === id);
  if (!h) return;
  const tk = key(today0());
  if (k > tk) return;                                     // لا تأشير على المستقبل
  const before = streakOf(h);
  const set = new Set(h.days);
  const turnedOn = !set.has(k);
  if (turnedOn) set.add(k); else set.delete(k);
  h.days = [...set].sort();
  /* تأشير يوم قبل إنشاء العادة يقدّم تاريخ إنشائها */
  const d = fromKey(k);
  if (turnedOn && d < createdDay(h)) h.createdAt = d.getTime();
  try { navigator.vibrate && navigator.vibrate(12); } catch(e){}
  renderHabits();
  await putHabit(h);

  if (turnedOn){
    const after = streakOf(h);
    const all = C.S.habits.every(x => x.days.includes(tk));
    if ([7, 14, 30, 50, 100, 365].includes(after) && after > before){
      C.toast(L("{0} — {1} يوم متتالي 🔥", h.name, after));
    } else if (k === tk && all && C.S.habits.length > 1){
      C.toast(L("أنجزت كل عاداتك اليوم 🎉"));
    }
  }
}

function wireBox(box){
  box.querySelectorAll(".hb-item").forEach(li => {
    const id = li.dataset.id;
    li.querySelector(".hb-check").onclick = () => toggleDay(id, key(today0()));
    /* الضغط على اسم العادة يؤشّرها أيضاً — أسهل على الإصبع */
    li.querySelector(".hb-name").onclick = () => toggleDay(id, key(today0()));
    li.querySelector(".hb-edit").onclick = () => openSheet(C.S.habits.find(h => h.id === id));
    li.querySelectorAll(".hb-dot").forEach(b => {
      b.onclick = e => { e.stopPropagation(); toggleDay(id, b.dataset.day); };
    });
  });
  box.querySelectorAll(".hb-starter").forEach(b => {
    b.onclick = async () => {
      const s = STARTERS[+b.dataset.i];
      await putHabit({ id: uid(), name: L(s.name), emoji: s.emoji, createdAt: Date.now(), days: [] });
      renderHabits();
    };
  });
  /* تلميح خانات الخريطة */
  let tip = document.getElementById("chartTip");
  if (!tip){
    tip = document.createElement("div");
    tip.id = "chartTip"; tip.className = "chart-tip"; tip.hidden = true;
    document.body.appendChild(tip);
  }
  box.querySelectorAll(".hb-hc[data-tip]").forEach(el => {
    el.onclick = () => {
      tip.textContent = el.dataset.tip; tip.hidden = false;
      const r = el.getBoundingClientRect();
      tip.style.top  = (window.scrollY + r.top - tip.offsetHeight - 10) + "px";
      const x = r.left + r.width/2 - tip.offsetWidth/2;
      tip.style.left = Math.max(10, Math.min(window.innerWidth - tip.offsetWidth - 10, x)) + "px";
      clearTimeout(el._t); el._t = setTimeout(() => { tip.hidden = true; }, 2200);
    };
  });
}

/* ---------------- ورقة الإضافة والتعديل ---------------- */
let editing = null, pickedEmoji = EMOJIS[0];

function firstGrapheme(s){
  s = String(s || "").trim();
  if (!s) return "";
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter){
      const it = new Intl.Segmenter(undefined, { granularity:"grapheme" }).segment(s)[Symbol.iterator]().next();
      return it.value ? it.value.segment : "";
    }
  } catch(e){}
  return Array.from(s)[0] || "";
}

function paintEmoji(){
  $("hbEmoPrev").textContent = pickedEmoji;
  $("hbEmojis").querySelectorAll("button").forEach(b =>
    b.classList.toggle("on", b.textContent === pickedEmoji));
}

function openSheet(h){
  editing = h || null;
  pickedEmoji = h ? h.emoji : EMOJIS[0];
  $("hbTitle").textContent = h ? L("تعديل العادة") : L("عادة جديدة");
  $("hbName").value = h ? h.name : "";
  $("hbEmoIn").value = "";
  $("hbDel").hidden = !h;
  $("hbEmojis").innerHTML = EMOJIS.map(e => `<button type="button" class="hb-emo-b">${e}</button>`).join("");
  $("hbEmojis").querySelectorAll("button").forEach(b => {
    b.onclick = () => { pickedEmoji = b.textContent; $("hbEmoIn").value = ""; paintEmoji(); };
  });
  paintEmoji();
  $("habitSheet").hidden = false;
  if (!h) setTimeout(() => $("hbName").focus(), 60);
}
const closeSheet = () => { $("habitSheet").hidden = true; editing = null; };

async function saveSheet(){
  const name = $("hbName").value.trim().slice(0, NAME_MAX);
  if (!name){ C.toast(L("اكتب اسم العادة")); $("hbName").focus(); return; }
  const dup = C.S.habits.some(h => h.name === name && (!editing || h.id !== editing.id));
  if (dup){ C.toast(L("عندك عادة بنفس الاسم")); return; }
  const isNew = !editing;
  const h = editing
    ? { ...editing, name, emoji: pickedEmoji }
    : { id: uid(), name, emoji: pickedEmoji, createdAt: Date.now(), days: [] };
  closeSheet();
  await putHabit(h);
  renderHabits();
  if (isNew) C.toast(L("أُضيفت العادة — أشّرها كل يوم"));
}

async function deleteFromSheet(){
  const h = editing;
  if (!h) return;
  $("habitSheet").hidden = true;
  const ok = await C.ask(L("حذف العادة"), L("«{0}» وكل سجلها وسلسلتها — ما تقدر ترجعها.", h.name));
  if (!ok){ $("habitSheet").hidden = false; return; }
  editing = null;
  await dropHabit(h.id);
  renderHabits();
}

function wire(){
  const add = $("btnNewHabit");
  if (add) add.onclick = () => openSheet(null);
  $("hbSave").onclick = saveSheet;
  $("hbNo").onclick = closeSheet;
  $("hbDel").onclick = deleteFromSheet;
  $("habitSheet").addEventListener("click", e => { if (e.target.id === "habitSheet") closeSheet(); });
  $("hbName").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); saveSheet(); } });
  $("hbEmoIn").addEventListener("input", () => {
    const g = firstGrapheme($("hbEmoIn").value);
    if (g){ pickedEmoji = g; paintEmoji(); }
  });
  /* يوم جديد والتطبيق مفتوح — نعيد الرسم حتى تتصفّر قائمة اليوم */
  let lastDay = key(today0());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const k = key(today0());
    if (k !== lastDay){ lastDay = k; if (!$("v-habits").hidden) renderHabits(); }
  });
}
