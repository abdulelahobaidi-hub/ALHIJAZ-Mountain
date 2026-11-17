/* ============================================================
   نادي الجبال — مركز الإشعارات
   ▸ يجمع في مكان واحد: طلبات الصداقة، الرسائل الخاصة، رسائل القروبات
     ونشاطها والتصفيق لتمرينك، نتائج التحديات، إنجازات الأصدقاء،
     وتذكيرات شخصية (سلسلتك في خطر، جدول اليوم، العادات، ملخص الأسبوع).
   ▸ كل شيء يُحسب على الجهاز من بيانات موجودة أصلاً — بلا خادم إضافي.
     المستمعون الحيّون: طلبات الصداقة، وثيقة كل محادثة خاصة، وآخر رسائل كل قروب.
   ▸ حالة القراءة: users/{uid}/meta/notif (تتزامن بين الأجهزة) + نسخة محلية.
   ============================================================ */

import { L, LOC } from "./i18n.js";
import { clubData, acceptReq, rejectReq, goDM, goGroup, goFriend, clapAct,
         refreshClub, paintGroups } from "./social.js";

let C = null;
let items = [];
let st = null;                 // { seenAt, read:{}, first:{} }
let isOpen = false, openedAt = 0;
let filter = "all";
let booted = false, firstBuild = true, bootAt = 0;
let prevIds = new Set();
let reqs = [];
let reqUnsub = null;
const dmUnsubs = {}, dmDocs = {};
const grpUnsubs = {}, grpMsgs = {};
let timer = 0, saveT = 0, huT = 0;

const DAY = 86400000, KEEP_DAYS = 14;
const MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365];

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const isCloud = () => C && C.S.mode === "cloud" && C.S.fb;
const myUid = () => C && C.S.user && C.S.user.uid;
const stKey = () => "hejaz.notif." + (myUid() || "x");
const plain = h => String(h).replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"');

function lsGet(k, fb){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e){ return fb; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

function since(ms){
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return L("الحين");
  if (s < 3600) return L("قبل {0} دقيقة", Math.floor(s/60));
  if (s < 86400) return L("قبل {0} ساعة", Math.floor(s/3600));
  const a = new Date(ms); a.setHours(0,0,0,0);
  const b = new Date();   b.setHours(0,0,0,0);
  const d = Math.round((b - a) / DAY);
  if (d <= 1) return L("أمس");
  if (d < 7)  return L("قبل {0} يوم", d);
  return new Date(ms).toLocaleDateString(LOC(), { day:"numeric", month:"short" });
}
const atHour = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
function weekStart(t = Date.now()){ const x = new Date(t); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x.getTime(); }

function avatar(p, size = 46){
  const st = `width:${size}px;height:${size}px`;
  return p && p.photo
    ? `<span class="av" style="${st};background-image:url('${esc(p.photo)}')"></span>`
    : `<span class="av" style="${st}">${esc(((p && p.name) || L("؟")).trim().charAt(0))}</span>`;
}

/* ============================================================
   حالة القراءة
   ============================================================ */
function loadState(){
  st = lsGet(stKey(), null);
  if (!st || typeof st !== "object"){
    /* أول تشغيل: ما قبل يوم يُعدّ مقروءاً — لا نغرق المستخدم بقديم */
    st = { seenAt: Date.now() - DAY, read: {}, first: {} };
  }
  st.read = st.read || {}; st.first = st.first || {};
}
function saveState(cloud){
  /* نقلّم القوائم حتى لا تكبر بلا حد */
  const trim = o => Object.fromEntries(Object.entries(o).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 300));
  st.read = trim(st.read); st.first = trim(st.first);
  lsSet(stKey(), st);
  if (cloud && isCloud()){
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const { db, m } = C.S.fb;
      try { await m.setDoc(m.doc(db, "users", myUid(), "meta", "notif"), { seenAt: st.seenAt }, { merge: true }); }
      catch(err){ console.error("notif save", err); }
    }, 800);
  }
}
async function pullState(){
  if (!isCloud()) return;
  const { db, m } = C.S.fb;
  try {
    const snap = await m.getDoc(m.doc(db, "users", myUid(), "meta", "notif"));
    if (snap.exists()){
      const v = +snap.data().seenAt || 0;
      if (v > st.seenAt){ st.seenAt = v; saveState(false); }
    }
  } catch(err){ console.error("notif pull", err); }
}
const isUnread = it => !st.read[it.id] && it.at > st.seenAt;
function markRead(pred){
  let n = 0;
  items.forEach(it => { if (pred(it) && !st.read[it.id]){ st.read[it.id] = Date.now(); n++; } });
  if (n){ saveState(false); paint(); }
}

/* ============================================================
   جمع الإشعارات
   ============================================================ */
function collect(){
  const out = [];
  const me = myUid();
  const cut = Date.now() - KEEP_DAYS * DAY;
  const S = C.S;

  if (isCloud()){
    const { friends, groups, duels, pairId } = clubData();
    const fmap = Object.fromEntries(friends.map(f => [f.uid, f]));

    /* طلبات الصداقة */
    reqs.forEach(r => out.push({
      id: "req:" + r.id, cat: "frd", kind: "req", at: r.at || 0, who: { name: r.fromName, photo: r.fromPhoto },
      html: L("<b>{0}</b> أرسل لك طلب صداقة", esc(r.fromName || L("عضو"))),
      sub: L("رقم العضوية {0}", esc(r.fromMemberId || "—")),
      req: r.id, go: () => C.show("club")
    }));

    /* الرسائل الخاصة: آخر رسالة على وثيقة المحادثة */
    Object.entries(dmDocs).forEach(([pair, d]) => {
      if (!d || !d.lastUid || d.lastUid === me || !(d.at > cut)) return;
      const f = fmap[d.lastUid] || { name: d.lastName };
      out.push({
        id: `dm:${pair}:${d.at}`, cat: "dm", kind: "dm", at: d.at, who: f, pair,
        html: L("<b>{0}</b> أرسل لك رسالة", esc(f.name || d.lastName || L("صديق"))),
        quote: d.lastText || "", go: () => goDM(d.lastUid)
      });
    });

    /* القروبات: رسائل، تمارين الأعضاء، والتصفيق لتمرينك */
    groups.forEach(g => {
      (grpMsgs[g.id] || []).forEach(msg => {
        if (!(msg.at > cut)) return;
        if (msg.uid !== me && msg.kind !== "sys"){
          out.push({
            id: `gm:${g.id}:${msg.id}`, cat: "grp", kind: "gmsg", at: msg.at, gid: g.id,
            who: fmap[msg.uid] || { name: msg.name },
            html: L("<b>{0}</b> في «{1}»", esc(msg.name), esc(g.name)),
            quote: msg.text, go: () => goGroup(g.id, "chat")
          });
        } else if (msg.uid !== me && msg.kind === "sys"){
          const clapped = (msg.claps || []).includes(me);
          out.push({
            id: `ga:${g.id}:${msg.id}`, cat: "grp", kind: "gact", at: msg.at, gid: g.id,
            who: fmap[msg.uid] || { name: msg.name },
            html: `<b>${esc(msg.name)}</b> ${esc(msg.text)}`, sub: esc(g.name),
            clap: { gid: g.id, mid: msg.id, on: clapped }, go: () => goGroup(g.id, "acts")
          });
        } else if (msg.uid === me && msg.kind === "sys" && (msg.claps || []).length){
          const names = (msg.claps || []).map(u => (fmap[u] && fmap[u].name) || "").filter(Boolean);
          const n = msg.claps.length;
          const id = `gc:${g.id}:${msg.id}:${n}`, base = `gc:${g.id}:${msg.id}`;
          /* أول مرة نشوف تصفيقاً على هذا التمرين: وقته وقت التمرين. بعدها كل زيادة بوقت اكتشافها */
          if (!st.first[id]){ st.first[id] = st.first[base] ? Date.now() : msg.at; st.first[base] = st.first[id]; }
          const who = names.length ? (n > 1 && names[1]
            ? L("{0} و{1}", esc(names[0]), n > 2 ? L("{0} آخرين", n - 1) : esc(names[1]))
            : esc(names[0])) : L("{0} أعضاء", n);
          out.push({
            id, cat: "you", kind: "clap", at: st.first[id], gid: g.id,
            html: L("<b>{0}</b> صفّقوا لتمرينك 👏", who), sub: esc(g.name), emoji: "👏",
            go: () => goGroup(g.id, "acts")
          });
        }
      });
    });

    /* نتيجة التحدي الثنائي */
    Object.entries(duels || {}).forEach(([fu, d]) => {
      if (!(d.endAt < Date.now() && d.endAt > cut)) return;
      const f = fmap[fu] || { name: L("صديقك") };
      const mine = d.a === me ? d.scoreA : d.scoreB, his = d.a === me ? d.scoreB : d.scoreA;
      const res = mine === his ? L("تعادلتوا") : mine > his ? L("فزت 🎉") : L("فاز هو");
      out.push({
        id: `duel:${d.id}:${d.endAt}`, cat: "frd", kind: "duel", at: d.endAt, who: f,
        html: L("انتهى تحديك مع <b>{0}</b> — {1}", esc(f.name), res),
        sub: L("{0} مقابل {1}", mine || 0, his || 0), go: () => goFriend(fu)
      });
    });

    /* إنجازات الأصدقاء: وصلوا محطة في سلسلتهم */
    friends.forEach(f => {
      const n = f.streak || 0;
      if (!MILESTONES.includes(n) || !(f.lastAt > Date.now() - 3 * DAY)) return;
      out.push({
        id: `ms:${f.uid}:${n}`, cat: "frd", kind: "ms", at: f.lastAt, who: f,
        html: L("<b>{0}</b> وصل {1} يوم متتالي 🔥", esc(f.name), n),
        sub: L("شجّعه برسالة"), go: () => goDM(f.uid)
      });
    });
    void pairId;
  }

  /* ---------- تذكيرات شخصية ---------- */
  const now = new Date(), h = now.getHours(), dk = C.dayKey(now);
  const si = C.streakInfo();
  const slot = C.todaySlot ? C.todaySlot() : { rest:false, planned:false };

  if (si.current > 0 && !si.todayDone && !slot.rest && h >= 17){
    const left = 24 - h;
    out.push({
      id: "risk:" + dk, cat: "you", kind: "risk", at: atHour(17),
      html: L("<b>سلسلتك {0} يوم</b> تنتظر تمرين اليوم", si.current),
      sub: left <= 1 ? L("أقل من ساعة على نهاية اليوم — ١٠ دقائق تكفي")
                     : L("باقي {0} ساعات على نهاية اليوم — ١٠ دقائق تكفي", left),
      go: () => C.show("home")
    });
  }
  if (slot.planned && !slot.rest && slot.plan && !si.todayDone && h >= 7){
    out.push({
      id: "plan:" + dk, cat: "you", kind: "plan", at: atHour(7),
      html: L("جدول اليوم: <b>{0}</b>", esc(slot.plan.name)),
      sub: L("{0} جولة · {1} دقيقة", C.planRounds(slot.plan), Math.round(C.planSeconds(slot.plan) / 60)),
      go: () => C.show("home")
    });
  }
  const hb = S.habits || [];
  const hbLeft = hb.filter(x => !(x.days || []).includes(dk)).length;
  if (hb.length && hbLeft && h >= 20){
    out.push({
      id: "hb:" + dk, cat: "you", kind: "habit", at: atHour(20),
      html: hbLeft === 1 ? L("<b>باقي عادة واحدة</b> اليوم") : L("<b>باقي {0} عادات</b> اليوم", hbLeft),
      sub: L("{0} من {1} مكتملة — خاصة بك وحدك", hb.length - hbLeft, hb.length),
      go: () => C.show("habits")
    });
  }
  if (si.current && si.todayDone && MILESTONES.includes(si.current)){
    const last = (S.sessions || [])[0];
    out.push({
      id: "myms:" + si.current, cat: "you", kind: "ms", at: last ? last.at : Date.now(),
      html: L("<b>وصلت {0} يوم متتالي!</b> 🔥", si.current),
      sub: L("شارك إنجازك مع أصدقائك"), go: () => C.show("home")
    });
  }
  /* ملخص الأسبوع الماضي — صباح الأحد */
  const ws = weekStart(), pws = ws - 7 * DAY, ppws = pws - 7 * DAY;
  const done = (S.sessions || []).filter(x => x.completed !== false);
  const lastWk = done.filter(x => x.at >= pws && x.at < ws);
  if (lastWk.length && Date.now() >= ws + 8 * 3600000){
    const prev = done.filter(x => x.at >= ppws && x.at < pws).length;
    const mins = Math.round(lastWk.reduce((a, x) => a + (x.secs || 0), 0) / 60);
    const diff = lastWk.length - prev;
    out.push({
      id: "wk:" + C.dayKey(ws), cat: "you", kind: "week", at: ws + 8 * 3600000,
      html: L("ملخص أسبوعك: <b>{0} تمارين · {1} دقيقة</b>", lastWk.length, mins),
      sub: diff > 0 ? L("+{0} عن الأسبوع اللي قبله 💪", diff)
         : diff < 0 ? L("{0} أقل من الأسبوع اللي قبله — هالأسبوع فرصتك", -diff)
         : L("نفس الأسبوع اللي قبله — ثابت"),
      go: () => C.show("log")
    });
  }

  return out.filter(it => it.at > cut).sort((a, b) => b.at - a.at);
}

/* ============================================================
   المستمعون الحيّون
   ============================================================ */
function listenRequests(){
  if (reqUnsub || !isCloud()) return;
  const { db, m } = C.S.fb;
  const q = m.query(m.collection(db, "friendRequests"), m.where("to", "==", myUid()));
  reqUnsub = m.onSnapshot(q, snap => {
    reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const known = new Set(clubData().requests.map(r => r.id));
    if (reqs.length !== known.size || reqs.some(r => !known.has(r.id))) refreshClub();
    else rebuild();
  }, err => console.error("notif reqs", err));
}

/* يتابع محادثات الأصدقاء الحاليين وقروباتي — يضيف الجديد ويوقف القديم */
function syncListeners(){
  if (!isCloud()) return;
  const { db, m } = C.S.fb;
  const { friends, groups, pairId } = clubData();
  const me = myUid();

  const pairs = new Set(friends.map(f => pairId(me, f.uid)));
  pairs.forEach(pair => {
    if (dmUnsubs[pair]) return;
    dmUnsubs[pair] = m.onSnapshot(m.doc(db, "dms", pair), snap => {
      dmDocs[pair] = snap.exists() ? snap.data() : null;
      rebuild();
    }, err => console.error("notif dm", err));
  });
  Object.keys(dmUnsubs).forEach(p => { if (!pairs.has(p)){ dmUnsubs[p](); delete dmUnsubs[p]; delete dmDocs[p]; } });

  const gids = new Set(groups.map(g => g.id));
  gids.forEach(gid => {
    if (grpUnsubs[gid]) return;
    const q = m.query(m.collection(db, "groups", gid, "messages"), m.orderBy("at", "desc"), m.limit(15));
    grpUnsubs[gid] = m.onSnapshot(q, snap => {
      grpMsgs[gid] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rebuild();
    }, err => console.error("notif group", err));
  });
  Object.keys(grpUnsubs).forEach(g => { if (!gids.has(g)){ grpUnsubs[g](); delete grpUnsubs[g]; delete grpMsgs[g]; } });
  rebuild();
}

/* آخر رسالة في القروب وعدد غير المقروء — لقائمة القروبات في النادي */
export function groupMeta(gid){
  const list = grpMsgs[gid];
  if (!list || !st) return null;
  const last = list[0] || null;
  const unread = items.filter(it => it.gid === gid && it.cat === "grp" && it.kind === "gmsg" && isUnread(it)).length;
  return { last, unread };
}

/* ============================================================
   البناء والرسم
   ============================================================ */
let rebuildT = 0;
function rebuild(){
  clearTimeout(rebuildT);
  rebuildT = setTimeout(rebuildNow, 60);
}
function rebuildNow(){
  if (!C || !C.S.user || !st) return;
  items = collect();

  /* ما تشوفه الآن على الشاشة يُعدّ مقروءاً */
  const { curGroup, dmWith, pairId } = isCloud() ? clubData() : {};
  const inDM = dmWith && !$("v-dm").hidden ? pairId(myUid(), dmWith.uid) : null;
  const inGroup = curGroup && !$("v-group").hidden ? curGroup.id : null;
  items.forEach(it => {
    if ((inDM && it.pair === inDM) || (inGroup && it.gid === inGroup && it.kind !== "clap"))
      st.read[it.id] = st.read[it.id] || Date.now();
  });

  /* الجديد منذ آخر بناء — يظهر كتنبيه علوي */
  const fresh = (firstBuild || Date.now() - bootAt < 5000) ? [] : items.filter(it => !prevIds.has(it.id) && isUnread(it)
    && it.at > Date.now() - 5 * 60000 && it.cat !== "you");
  prevIds = new Set(items.map(it => it.id));
  firstBuild = false;
  saveState(false);
  paint();
  if (fresh.length) arrive(fresh[0], fresh.length);
}

function paint(){
  const n = items.filter(isUnread).length;
  const b = $("bellN");
  if (b){
    b.hidden = !n;
    b.textContent = n > 9 ? "9+" : String(n);
    $("btnBell").setAttribute("aria-label", n ? L("الإشعارات — {0} جديدة", n) : L("الإشعارات"));
  }
  /* نقطة على تبويب النادي لما يكون فيه جديد من الأصدقاء أو القروبات */
  const club = document.querySelector('.tabbar [data-view="club"]');
  if (club) club.classList.toggle("dot", items.some(it => it.cat !== "you" && isUnread(it)));
  if (isOpen) renderPanel();
  if (!$("v-club").hidden) paintGroups();
}

const KIND = {
  req:   { ic: "i-user-plus", c: "k-rose" },
  dm:    { ic: "i-chat",      c: "k-blue" },
  gmsg:  { ic: "i-chat",      c: "k-plum" },
  gact:  { ic: "i-check",     c: "k-green" },
  clap:  { ic: "",            c: "k-gold" },
  duel:  { ic: "i-trophy",    c: "k-gold" },
  ms:    { ic: "i-flame",     c: "k-flame" },
  risk:  { ic: "i-flame",     c: "k-flame" },
  plan:  { ic: "i-list",      c: "k-rose" },
  habit: { ic: "i-habit",     c: "k-green" },
  week:  { ic: "i-chart",     c: "k-plum" }
};
const FILTERS = [
  ["all", "الكل"], ["frd", "الأصدقاء"], ["dm", "الرسائل"], ["grp", "القروبات"], ["you", "أنت"]
];

function leadHTML(it){
  const k = KIND[it.kind] || KIND.plan;
  const badge = k.ic ? `<svg class="ic"><use href="#${k.ic}"/></svg>` : `<span>${it.emoji || ""}</span>`;
  if (it.who) return `<span class="nc-lead">${avatar(it.who, 48)}<i class="nc-kb ${k.c}">${badge}</i></span>`;
  return `<span class="nc-lead"><span class="nc-tile ${k.c}">${k.ic ? `<svg class="ic"><use href="#${k.ic}"/></svg>` : `<span>${it.emoji || ""}</span>`}</span></span>`;
}

function itemHTML(it, i){
  const un = isUnread(it);
  const act = it.req
    ? `<span class="nc-acts">
         <button type="button" class="nc-yes" data-yes="${esc(it.req)}"><svg class="ic"><use href="#i-check"/></svg><span>${L("قبول")}</span></button>
         <button type="button" class="nc-no" data-no="${esc(it.req)}">${L("رفض")}</button>
       </span>`
    : it.clap
    ? `<button type="button" class="nc-clap${it.clap.on ? " on" : ""}" data-clap="${esc(it.clap.gid)}|${esc(it.clap.mid)}"
         ${it.clap.on ? "disabled" : ""} aria-label="${L("صفّق")}">👏</button>` : "";
  return `
    <li class="nc-it${un ? " un" : ""}" data-id="${esc(it.id)}" style="--d:${Math.min(i, 12) * 28}ms">
      <button type="button" class="nc-hit" data-go="${esc(it.id)}">
        ${leadHTML(it)}
        <span class="nc-main">
          <span class="nc-tx">${it.html}</span>
          ${it.quote ? `<span class="nc-q">${esc(it.quote)}</span>` : ""}
          ${it.sub ? `<span class="nc-sub">${it.sub}</span>` : ""}
          <span class="nc-time">${since(it.at)}</span>
        </span>
        ${un ? `<i class="nc-dot" aria-label="${L("جديد")}"></i>` : ""}
      </button>
      ${act}
    </li>`;
}

function bucketOf(t){
  const d0 = new Date(); d0.setHours(0,0,0,0);
  if (t >= d0.getTime()) return L("اليوم");
  if (t >= d0.getTime() - DAY) return L("أمس");
  if (t >= d0.getTime() - 6 * DAY) return L("هذا الأسبوع");
  return L("أقدم");
}

const EMPTY_ART = `
  <svg class="nc-art" viewBox="0 0 220 140" aria-hidden="true">
    <defs>
      <linearGradient id="ncSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--nc-sky1)"/><stop offset="1" stop-color="var(--nc-sky2)"/></linearGradient>
    </defs>
    <rect x="10" y="6" width="200" height="128" rx="28" fill="url(#ncSky)"/>
    <g fill="#FFF3C9"><circle cx="48" cy="34" r="1.6"/><circle cx="80" cy="22" r="1.1"/><circle cx="168" cy="30" r="1.4"/><circle cx="186" cy="56" r="1"/><circle cx="62" cy="62" r="1"/></g>
    <circle cx="150" cy="48" r="15" fill="#FFF3C9"/><circle cx="157" cy="43" r="13" fill="url(#ncSky)"/>
    <path d="M10 112 L56 70 L84 90 L120 56 L158 94 L184 78 L210 98 V106 Q210 134 182 134 H38 Q10 134 10 106Z" fill="#8A3F5C" opacity=".75"/>
    <path d="M120 56 L131 67 L125 66 L120 72 L114 65 L109 67Z" fill="#FFF3C9" opacity=".8"/>
    <path d="M10 120 L48 102 L96 118 L150 98 L210 120 V106 Q210 134 182 134 H38 Q10 134 10 106Z" fill="#54244A"/>
  </svg>`;

function renderPanel(){
  const box = $("ncBody"); if (!box) return;
  const n = items.filter(isUnread).length;
  $("ncSub").textContent = n ? L("{0} جديدة", n) : L("كلها مقروءة");
  $("ncAll").disabled = !n;

  const counts = {};
  items.forEach(it => { if (isUnread(it)) counts[it.cat] = (counts[it.cat] || 0) + 1; });
  $("ncChips").innerHTML = FILTERS.map(([k, t]) => {
    const c = k === "all" ? n : counts[k] || 0;
    return `<button type="button" class="${filter === k ? "on" : ""}" data-f="${k}">${L(t)}${c ? `<b>${c}</b>` : ""}</button>`;
  }).join("");

  const list = items.filter(it => filter === "all" || it.cat === filter);
  if (!list.length){
    box.innerHTML = `<div class="nc-empty">${EMPTY_ART}
      <b>${filter === "all" ? L("كل شيء هادئ فوق الجبل") : L("ما فيه شيء هنا")}</b>
      <p>${isCloud() || filter === "you"
        ? L("نخبرك أول ما يرسل لك أحد، أو يتحرك قروبك، أو تحتاج سلسلتك دفعة.")
        : L("سجّل دخولك عشان توصلك رسائل أصدقائك وقروباتك هنا.")}</p></div>`;
    return;
  }

  /* الطلبات أولاً لأنها تنتظر قرارك، ثم البقية حسب اليوم */
  const pinned = list.filter(it => it.req);
  const rest = list.filter(it => !it.req);
  let h = "", i = 0;
  if (pinned.length){
    h += `<p class="nc-sec">${L("بانتظار ردّك")}</p><ul class="nc-list">${pinned.map(it => itemHTML(it, i++)).join("")}</ul>`;
  }
  let cur = "";
  rest.forEach(it => {
    const b = bucketOf(it.at);
    if (b !== cur){ if (cur) h += `</ul>`; cur = b; h += `<p class="nc-sec">${b}</p><ul class="nc-list">`; }
    h += itemHTML(it, i++);
  });
  if (cur) h += `</ul>`;
  box.innerHTML = h;
}

/* ============================================================
   الفتح والإغلاق والتنقل
   ============================================================ */
export function openCenter(){
  if (isOpen) return;
  isOpen = true; openedAt = Date.now(); filter = "all";
  renderPanel();
  const nc = $("nc");
  nc.hidden = false;
  requestAnimationFrame(() => nc.classList.add("in"));
  document.documentElement.classList.add("nc-lock");
  hideHU();
  setTimeout(() => { const x = $("ncClose"); x && x.focus({ preventScroll: true }); }, 60);
}
export function closeCenter(){
  if (!isOpen) return;
  isOpen = false;
  /* ما شفته في هذه الفتحة صار مقروءاً */
  st.seenAt = Math.max(st.seenAt, openedAt);
  saveState(true);
  const nc = $("nc");
  nc.classList.remove("in");
  document.documentElement.classList.remove("nc-lock");
  setTimeout(() => { if (!isOpen) nc.hidden = true; }, 260);
  paint();
  const bell = $("btnBell"); bell && bell.focus({ preventScroll: true });
}

function goItem(id){
  const it = items.find(x => x.id === id); if (!it) return;
  st.read[it.id] = Date.now(); saveState(false);
  closeCenter();
  setTimeout(() => it.go && it.go(), 30);
}

/* ---------- التنبيه العلوي ---------- */
function arrive(it, more){
  const bell = $("btnBell");
  if (bell){ bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring"); }
  if (document.hidden) return sysNotify(it);
  if (isOpen) return;
  const hu = $("hu");
  hu.innerHTML = `${leadHTML(it)}
    <span class="nc-main"><span class="nc-tx">${it.html}</span>
      ${it.quote ? `<span class="nc-q">${esc(it.quote)}</span>` : it.sub ? `<span class="nc-sub">${it.sub}</span>` : ""}</span>
    ${more > 1 ? `<span class="hu-more">+${more - 1}</span>` : ""}`;
  hu.dataset.id = it.id;
  hu.hidden = false;
  requestAnimationFrame(() => hu.classList.add("in"));
  clearTimeout(huT);
  huT = setTimeout(hideHU, 4800);
}
function hideHU(){
  const hu = $("hu"); if (!hu || hu.hidden) return;
  hu.classList.remove("in");
  clearTimeout(huT);
  setTimeout(() => { if (!hu.classList.contains("in")) hu.hidden = true; }, 300);
}
/* التطبيق في الخلفية والإذن ممنوح: إشعار من النظام */
async function sysNotify(it){
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || !navigator.serviceWorker) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    reg.showNotification(L("نادي الجبال"), {
      body: plain(it.html) + (it.quote ? "\n" + it.quote : ""),
      icon: "icon-192.png", badge: "icon-192.png", tag: it.id, lang: document.documentElement.lang,
      data: { url: location.origin + location.pathname }
    });
  } catch(e){}
}

/* ============================================================
   boot
   ============================================================ */
export function initNotify(ctx){
  C = ctx;
  $("btnBell").onclick = openCenter;
  $("ncClose").onclick = closeCenter;
  $("nc").addEventListener("click", e => { if (e.target.id === "nc") closeCenter(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen) closeCenter(); });
  $("ncAll").onclick = () => {
    st.seenAt = Date.now(); openedAt = st.seenAt;
    saveState(true); paint();
  };
  $("ncChips").addEventListener("click", e => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f; renderPanel();
    const on = $("ncChips").querySelector(".on");
    on && on.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  });
  $("ncBody").addEventListener("click", async e => {
    const y = e.target.closest("[data-yes]"), no = e.target.closest("[data-no]");
    const cl = e.target.closest("[data-clap]"), go = e.target.closest("[data-go]");
    if (y){ y.disabled = true; await acceptReq(y.dataset.yes); return; }
    if (no){ no.disabled = true; await rejectReq(no.dataset.no); return; }
    if (cl){
      const [gid, mid] = cl.dataset.clap.split("|");
      cl.disabled = true; cl.classList.add("on", "pop");
      await clapAct(gid, mid);
      return;
    }
    if (go) goItem(go.dataset.go);
  });
  $("hu").onclick = () => { const id = $("hu").dataset.id; hideHU(); if (id) goItem(id); };

  /* سحب لوحة الإشعارات للأسفل يغلقها */
  let y0 = null;
  const head = document.querySelector(".nc-head");
  head.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
  head.addEventListener("touchmove", e => {
    if (y0 == null) return;
    const dy = Math.max(0, e.touches[0].clientY - y0);
    $("ncPanel").style.transform = dy ? `translateY(${dy}px)` : "";
  }, { passive: true });
  head.addEventListener("touchend", e => {
    const dy = y0 == null ? 0 : e.changedTouches[0].clientY - y0;
    y0 = null; $("ncPanel").style.transform = "";
    if (dy > 90) closeCenter();
  });

  document.addEventListener("club:data", syncListeners);
  document.addEventListener("club:dm-open", e => markRead(it => it.pair === e.detail));
  document.addEventListener("club:group-open", e => markRead(it => it.gid === e.detail && it.kind !== "clap"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rebuild(); });
}

/* يُستدعى بعد الدخول وتحميل البيانات */
export async function notifyBoot(){
  notifyTeardown();
  loadState();
  booted = true; firstBuild = true; bootAt = Date.now();
  await pullState();
  listenRequests();
  syncListeners();
  rebuildNow();
  timer = setInterval(rebuild, 60000);
}
/* بعد تمرين أو تغيّر العادات: التذكيرات الشخصية تتحدث */
export function notifyRefresh(){ if (booted) rebuild(); }

export function notifyTeardown(){
  booted = false;
  clearInterval(timer);
  if (reqUnsub){ reqUnsub(); reqUnsub = null; }
  Object.keys(dmUnsubs).forEach(k => { dmUnsubs[k](); delete dmUnsubs[k]; delete dmDocs[k]; });
  Object.keys(grpUnsubs).forEach(k => { grpUnsubs[k](); delete grpUnsubs[k]; delete grpMsgs[k]; });
  items = []; reqs = []; prevIds = new Set();
  if (isOpen){ isOpen = false; $("nc").hidden = true; $("nc").classList.remove("in"); document.documentElement.classList.remove("nc-lock"); }
  hideHU();
  const b = $("bellN"); if (b) b.hidden = true;
}
