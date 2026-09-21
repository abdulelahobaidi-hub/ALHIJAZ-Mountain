/* ============================================================
   نادي الجبال — الأصدقاء والقروبات
   profiles/{uid}              الملف العام (رقم العضوية + الستريك)
   memberIds/{memberId}        بحث عن العضو برقمه
   friendships/{a_b}           صداقة بين طرفين
   groups/{gid}                القروب وأعضاؤه وتحدّيه
   groups/{gid}/messages/{id}  محادثة القروب (رسائل فقط)
   groups/{gid}/plans/{id}     الجداول المنشورة للقروب
   groupCodes/{CODE}           بحث عن القروب بكود الدعوة
   ============================================================ */

import { L, LOC, lang } from "./i18n.js";

let C = null;                 // context handed over by app.js
let P = null;                 // my public profile
let friends = [];
let groups = [];
let curGroup = null;
let gTab = "board";
let unsubChat = null;
let boardCache = {};

const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* ---------- helpers ---------- */
const fb = () => C.S.fb;
const myUid = () => C.S.user && C.S.user.uid;
const isCloud = () => C.S.mode === "cloud" && C.S.fb;

function weekStart(d = Date.now()){
  const x = new Date(d); x.setHours(0,0,0,0);
  x.setDate(x.getDate() - x.getDay());          // الأسبوع يبدأ الأحد
  return x.getTime();
}
const weekKey = (d = Date.now()) => C.dayKey(weekStart(d));

function since(ms){
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return L("الحين");
  if (s < 3600) return L("قبل {0} دقيقة", Math.floor(s/60));
  if (s < 86400) return L("قبل {0} ساعة", Math.floor(s/3600));
  /* بعد ٢٤ ساعة نحسب بالأيام التقويمية لا بالساعات */
  const a = new Date(ms); a.setHours(0,0,0,0);
  const b = new Date();   b.setHours(0,0,0,0);
  const d = Math.round((b - a) / 86400000);
  if (d <= 1) return L("أمس");
  if (d < 7)  return L("قبل {0} يوم", d);
  return new Date(ms).toLocaleDateString(LOC(), { day:"numeric", month:"short" });
}

/* السلسلة كما هي الآن.
   الرقم المخزّن في ملف الصديق لقطة كتبها جهازه آخر مرة فتح التطبيق،
   فيبقى معلّقاً إذا انقطع. نحسبها من أيامه المنشورة حتى تنكسر في وقتها. */
function liveStreak(p){
  if (!p) return 0;
  const all = new Set([...(p.days || []), ...(p.frozen || [])]);
  if (!all.size) return 0;
  const probe = new Date(); probe.setHours(0,0,0,0);
  if (!all.has(C.dayKey(probe))) probe.setDate(probe.getDate() - 1);   // أمس يبقيها حيّة
  let n = 0;
  while (all.has(C.dayKey(probe))){ n++; probe.setDate(probe.getDate() - 1); }
  /* الأيام المنشورة محدودة بـ٢١ يوماً — إن استهلكناها كلها فالرقم المخزّن أدق */
  if (n >= all.size) n = Math.max(n, p.streak || 0);
  return n;
}

function avatar(p, size = 46){
  const st = `width:${size}px;height:${size}px`;
  return p && p.photo
    ? `<span class="av" style="${st};background-image:url('${esc(p.photo)}')"></span>`
    : `<span class="av" style="${st}">${esc(((p && p.name) || L("؟")).trim().charAt(0))}</span>`;
}

/* ---------- my stats ---------- */
function myStats(){
  const st = C.streakInfo();
  const done = C.S.sessions.filter(s => s.completed !== false);
  const ws = weekStart();
  const wk = done.filter(s => s.at >= ws);
  const sum = (a, k) => a.reduce((n, s) => n + (s[k] || 0), 0);
  return {
    streak: st.current,
    best: st.best,
    week: wk.length,
    total: done.length,
    /* لوحة ترتيب القروب: بالتمرين / بالدقائق / بالأوزان */
    minsWeek: Math.round(sum(wk, "secs") / 60),
    mins:     Math.round(sum(done, "secs") / 60),
    volWeek:  Math.round(sum(wk, "volume")),
    vol:      Math.round(sum(done, "volume")),
    lastAt: done.length ? done[0].at : 0,
    days: [...new Set(done.map(s => C.dayKey(s.at)))].sort().slice(-21),  // لعرض تقدّمه لأصدقائه
    frozen: Object.keys((C.S.freeze && C.S.freeze.used) || {}).sort().slice(-21),
    badges: C.badgeCount ? C.badgeCount() : 0
  };
}

/* شعلة الستريك — تظهر جنب الاسم لكل الأصدقاء */
function flame(n, big){
  if (!n) return "";
  return `<span class="flame${big ? " big" : ""}">🔥<b>${n}</b></span>`;
}

/* ============================================================
   PROFILE
   ============================================================ */
async function ensureProfile(){
  const { db, m } = fb(), uid = myUid();
  const ref = m.doc(db, "profiles", uid);
  const snap = await m.getDoc(ref);

  if (snap.exists()){
    P = { uid, ...snap.data() };
  } else {
    let memberId = null;
    for (let i = 0; i < 7 && !memberId; i++){
      const cand = String(Math.floor(100000 + Math.random() * 900000));
      const cRef = m.doc(db, "memberIds", cand);
      if (!(await m.getDoc(cRef)).exists()){
        await m.setDoc(cRef, { uid, at: Date.now() });
        memberId = cand;
      }
    }
    P = {
      uid, memberId: memberId || String(Date.now()).slice(-6),
      name: C.S.user.name, photo: C.S.user.photo || "",
      streak:0, best:0, week:0, total:0, lastAt:0, createdAt: Date.now()
    };
    await m.setDoc(ref, P);
  }
  await syncProfile();
}

export async function syncProfile(){
  if (!isCloud() || !P) return;
  const { db, m } = fb();
  const s = myStats();
  const patch = {
    name: C.S.user.name, photo: C.S.user.photo || "",
    ...s, weekKey: weekKey(), updatedAt: Date.now()
  };
  P = { ...P, ...patch };
  try { await m.updateDoc(m.doc(db, "profiles", myUid()), patch); }
  catch(err){ console.error("syncProfile", err); }
}

/* ============================================================
   LOOKUPS
   ============================================================ */
async function loadProfiles(uids){
  const { db, m } = fb();
  const out = {};
  const list = [...new Set(uids)].filter(Boolean);
  for (let i = 0; i < list.length; i += 10){
    const chunk = list.slice(i, i + 10);
    try {
      const q = m.query(m.collection(db, "profiles"), m.where(m.documentId(), "in", chunk));
      (await m.getDocs(q)).forEach(d => {
        const p = { uid: d.id, ...d.data() };
        p.streak = liveStreak(p);        // لا نثق بالرقم المخزّن — قد يكون قديماً
        out[d.id] = p;
      });
    } catch(err){ console.error("loadProfiles", err); }
  }
  return out;
}

/* ============================================================
   FRIENDS
   ============================================================ */
const pairId = (a, b) => [a, b].sort().join("_");

async function loadFriends(){
  if (!isCloud()) { friends = []; return; }
  const { db, m } = fb(), uid = myUid();
  const others = new Set();
  try {
    for (const f of ["a","b"]){
      const q = m.query(m.collection(db, "friendships"), m.where(f, "==", uid));
      (await m.getDocs(q)).forEach(d => {
        const v = d.data();
        others.add(v.a === uid ? v.b : v.a);
      });
    }
  } catch(err){ console.error("loadFriends", err); }
  const profs = await loadProfiles([...others]);
  friends = Object.values(profs).sort((x, y) => (y.streak||0) - (x.streak||0));
}

/* ---------- طلبات الصداقة ---------- */
let requests = [];          // الطلبات الواردة لي

async function sendRequest(raw){
  const id = String(raw || "").replace(/\D/g, "");
  if (id.length !== 6){ C.toast(L("رقم العضوية ٦ أرقام")); return; }
  const { db, m } = fb(), uid = myUid();
  try {
    const snap = await m.getDoc(m.doc(db, "memberIds", id));
    if (!snap.exists()){ C.toast(L("ما فيه عضو بهذا الرقم")); return; }
    const other = snap.data().uid;
    if (other === uid){ C.toast(L("هذا رقمك أنت")); return; }
    if (friends.some(f => f.uid === other)){ C.toast(L("هو أصلاً في قائمة أصدقائك")); return; }

    // لو هو أرسل لي طلب من قبل — نقبله مباشرة بدل ما نرسل طلباً مضاداً
    const incoming = requests.find(r => r.from === other);
    if (incoming){ await acceptRequest(incoming); return; }

    await m.setDoc(m.doc(db, "friendRequests", `${uid}_${other}`), {
      from: uid, to: other,
      fromName: C.S.user.name, fromPhoto: C.S.user.photo || "",
      fromMemberId: P ? P.memberId : "", at: Date.now()
    });
    C.toast(L("انرسل الطلب — ينتظر قبوله"));
  } catch(err){ console.error(err); C.toast(L("تعذّر إرسال الطلب")); }
}

async function loadRequests(){
  if (!isCloud()) { requests = []; return; }
  const { db, m } = fb();
  try {
    const q = m.query(m.collection(db, "friendRequests"), m.where("to", "==", myUid()));
    requests = (await m.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a,b) => (b.at||0) - (a.at||0));
  } catch(err){ console.error("loadRequests", err); requests = []; }
}

async function acceptRequest(req){
  const { db, m } = fb(), uid = myUid();
  try {
    await m.setDoc(m.doc(db, "friendships", pairId(uid, req.from)),
                   { a: uid, b: req.from, at: Date.now() });
    await m.deleteDoc(m.doc(db, "friendRequests", req.id));
    await loadRequests(); await loadFriends(); renderClub();
    C.toast(L("صرتوا أصدقاء — {0}", req.fromName || "").trim());
  } catch(err){ console.error(err); C.toast(L("تعذّر القبول")); }
}

async function rejectRequest(req){
  const { db, m } = fb();
  try {
    await m.deleteDoc(m.doc(db, "friendRequests", req.id));
    await loadRequests(); renderClub();
    C.toast(L("انرفض الطلب"));
  } catch(err){ console.error(err); C.toast(L("تعذّر الرفض")); }
}

async function removeFriend(other, name){
  const ok = await C.ask(L("حذف صديق"), L("{0} راح ينحذف من قائمتك.", name));
  if (!ok) return;
  const { db, m } = fb();
  try {
    await m.deleteDoc(m.doc(db, "friendships", pairId(myUid(), other)));
    await loadFriends(); renderClub(); C.toast(L("انحذف"));
  } catch(err){ console.error(err); C.toast(L("تعذّر الحذف")); }
}

/* ============================================================
   GROUPS
   ============================================================ */
async function loadGroups(){
  if (!isCloud()) { groups = []; return; }
  const { db, m } = fb();
  try {
    const q = m.query(m.collection(db, "groups"), m.where("memberUids", "array-contains", myUid()));
    groups = (await m.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }))
              .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  } catch(err){ console.error("loadGroups", err); groups = []; }
}

async function createGroup(name){
  name = String(name || "").trim();
  if (!name){ C.toast(L("اكتب اسم القروب")); return; }
  const { db, m } = fb(), uid = myUid();
  try {
    let code = null;
    for (let i = 0; i < 8 && !code; i++){
      const cand = Array.from({length:6}, () => CODE_ABC[Math.floor(Math.random()*CODE_ABC.length)]).join("");
      if (!(await m.getDoc(m.doc(db, "groupCodes", cand))).exists()) code = cand;
    }
    const ref = m.doc(m.collection(db, "groups"));
    await m.setDoc(ref, {
      name, code, ownerUid: uid, memberUids: [uid], admins: [uid], photo: "",
      createdAt: Date.now(),
      challenge: { target: 5, weekKey: weekKey() }
    });
    await m.setDoc(m.doc(db, "groupCodes", code), { gid: ref.id, at: Date.now() });
    await loadGroups(); renderClub();
    C.toast(L("انشأ القروب — كود الدعوة {0}", code));
  } catch(err){ console.error(err); C.toast(L("تعذّر إنشاء القروب — تأكد من قواعد Firestore")); }
}

async function joinByCode(raw){
  const code = String(raw || "").trim().toUpperCase();
  if (code.length !== 6){ C.toast(L("الكود ٦ خانات")); return; }
  const { db, m } = fb(), uid = myUid();
  try {
    const snap = await m.getDoc(m.doc(db, "groupCodes", code));
    if (!snap.exists()){ C.toast(L("كود غير صحيح")); return; }
    const gid = snap.data().gid;
    await m.updateDoc(m.doc(db, "groups", gid), { memberUids: m.arrayUnion(uid) });
    await loadGroups(); renderClub();
    C.toast(L("انضممت للقروب"));
  } catch(err){ console.error(err); C.toast(L("تعذّر الانضمام")); }
}

async function leaveGroup(g){
  const ok = await C.ask(L("مغادرة القروب"), L("{0} — تقدر ترجع بنفس الكود.", g.name), L("غادر"));
  if (!ok) return;
  const { db, m } = fb();
  try {
    await m.updateDoc(m.doc(db, "groups", g.id), { memberUids: m.arrayRemove(myUid()) });
    closeChat(); curGroup = null;
    await loadGroups(); C.show("club"); C.toast(L("غادرت القروب"));
  } catch(err){ console.error(err); C.toast(L("تعذّرت المغادرة")); }
}

/* ---------- الإشراف على القروب ---------- */
const groupAdmins = g => (g && g.admins && g.admins.length) ? g.admins : [g && g.ownerUid];
const isAdminOf   = g => groupAdmins(g).includes(myUid());

/* ترقية القروبات القديمة: تعبئة admins للمؤسس */
async function ensureAdmins(g){
  if (g.admins && g.admins.length) return;
  if (g.ownerUid !== myUid()) { g.admins = [g.ownerUid]; return; }
  const { db, m } = fb();
  try {
    await m.updateDoc(m.doc(db, "groups", g.id), { admins: [g.ownerUid] });
    g.admins = [g.ownerUid];
  } catch(err){ console.error("ensureAdmins", err); }
}

/* صورة القروب: نصغّرها في المتصفح ونخزّنها داخل وثيقة القروب */
function pickGroupPhoto(){
  return new Promise(resolve => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const file = inp.files && inp.files[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const S = 160, c = document.createElement("canvas");
        c.width = c.height = S;
        const side = Math.min(img.width, img.height);
        c.getContext("2d").drawImage(img, (img.width-side)/2, (img.height-side)/2, side, side, 0, 0, S, S);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    };
    inp.click();
  });
}

/* ============================================================
   التحدي الثنائي
   ============================================================ */
let duels = {};              // friendUid -> duel

async function loadDuels(){
  if (!isCloud()) { duels = {}; return; }
  const { db, m } = fb(), uid = myUid();
  duels = {};
  try {
    for (const f of ["a","b"]){
      const q = m.query(m.collection(db, "duels"), m.where(f, "==", uid));
      (await m.getDocs(q)).forEach(d => {
        const v = { id: d.id, ...d.data() };
        if (v.endAt > Date.now() - 7 * 86400000) duels[v.a === uid ? v.b : v.a] = v;
      });
    }
  } catch(err){ console.error("loadDuels", err); }
}

async function startDuel(f){
  const { db, m } = fb(), uid = myUid();
  const id = pairId(uid, f.uid);
  const start = Date.now(), end = start + 7 * 86400000;
  const meFirst = id.split("_")[0] === uid;
  const doc = {
    a: meFirst ? uid : f.uid,      b: meFirst ? f.uid : uid,
    aName: meFirst ? C.S.user.name : f.name,
    bName: meFirst ? f.name : C.S.user.name,
    startAt: start, endAt: end, scoreA: 0, scoreB: 0
  };
  try {
    await m.setDoc(m.doc(db, "duels", id), doc);
    duels[f.uid] = { id, ...doc };
    await pushDuelScores();
    C.toast(L("بدأ التحدي — أسبوع من الحين"));
    openFriendProfile(f);
  } catch(err){ console.error(err); C.toast(L("تعذّر بدء التحدي")); }
}

/* نكتب نتيجتنا نحن فقط في كل تحدٍّ نشط */
export async function pushDuelScores(){
  if (!isCloud()) return;
  const { db, m } = fb(), uid = myUid();
  const done = C.S.sessions.filter(s => s.completed !== false);
  for (const d of Object.values(duels)){
    if (Date.now() > d.endAt + 86400000) continue;
    const n = done.filter(s => s.at >= d.startAt && s.at <= d.endAt).length;
    const field = d.a === uid ? "scoreA" : "scoreB";
    if (d[field] === n) continue;
    d[field] = n;
    try { await m.updateDoc(m.doc(db, "duels", d.id), { [field]: n }); }
    catch(err){ console.error("duel score", err); }
  }
}

function duelHTML(f){
  const d = duels[f.uid];
  if (!d) return `<button class="btn btn-soft" id="duelStart">
      <svg class="ic"><use href="#i-trophy"/></svg><span>${L("تحدَّه أسبوعاً")}</span></button>`;

  const mine = d.a === myUid() ? d.scoreA : d.scoreB;
  const his  = d.a === myUid() ? d.scoreB : d.scoreA;
  const over = Date.now() > d.endAt;
  const left = Math.max(0, Math.ceil((d.endAt - Date.now()) / 86400000));
  const verdict = over
    ? (mine === his ? L("تعادل") : mine > his ? L("فزت 🎉") : L("فاز {0}", esc(f.name)))
    : L("باقي {0} {1}", left, left === 1 ? L("يوم") : L("أيام"));
  return `
    <div class="duel${over ? " over" : ""}">
      <p class="duel-top">${L("تحدي الأسبوع")}</p>
      <div class="duel-row">
        <span class="duel-side${mine >= his ? " lead" : ""}"><b>${mine}</b><span>${L("أنت")}</span></span>
        <span class="duel-vs">VS</span>
        <span class="duel-side${his >= mine ? " lead" : ""}"><b>${his}</b><span>${esc(f.name)}</span></span>
      </div>
      <p class="duel-foot">${verdict}</p>
    </div>`;
}

/* ============================================================
   WORKOUT HOOK
   ============================================================ */
/* التمرين يُسجَّل في تبويب «النشاط» لا في المحادثة —
   المحادثة للرسائل والجداول وحدها. */
export async function socialAfterWorkout(sess){
  if (!isCloud()) return;
  await syncProfile();
  if (!groups.length) await loadGroups();
  await pushDuelScores();
  const { db, m } = fb();
  const text = L("خلّص {0} — {1} جولة", sess.planName || L("تمرين"), sess.rounds);
  for (const g of groups){
    try {
      await m.addDoc(m.collection(db, "groups", g.id, "messages"),
        { uid: myUid(), name: C.S.user.name, text, at: Date.now(), kind: "sys", claps: [] });
    } catch(err){ console.error("activity", err); }
  }
}

/* ============================================================
   UI — club screen
   ============================================================ */
export function renderClub(){
  const me = $("meCard");
  if (!isCloud()){
    me.innerHTML = `<div class="me-lock">
        <p><b>${L("القروبات تحتاج حساب")}</b></p>
        <p class="muted">${L("سجّل دخولك بجوجل عشان يكون لك رقم عضوية وتقدر تضيف أصدقاء وتنشئ قروبات.")}</p>
      </div>`;
    $("friendList").innerHTML = ""; $("groupList").innerHTML = "";
    $("friendEmpty").hidden = false; $("groupEmpty").hidden = false;
    $("friendEmpty").textContent = L("سجّل دخولك عشان تضيف أصدقاء.");
    $("groupEmpty").textContent  = L("سجّل دخولك عشان تنشئ قروب.");
    return;
  }

  const s = myStats();
  me.innerHTML = `
    <div class="me-top">
      ${avatar(P, 58)}
      <div class="me-id">
        <b>${esc(P ? P.name : C.S.user.name)}</b>
        <span>${L("رقم عضويتك")}</span>
        <p class="member-id">${esc(P ? P.memberId : "—")}</p>
      </div>
      <button class="btn btn-soft btn-sq sm" id="btnCopyId" aria-label="${L("انسخ الرقم")}">
        <svg class="ic"><use href="#i-copy"/></svg>
      </button>
    </div>
    <div class="me-stats">
      <span><b>${s.streak}</b>${L("أيام متتالية")}</span>
      <span><b>${s.week}</b>${L("هذا الأسبوع")}</span>
      <span><b>${s.total}</b>${L("تمرين")}</span>
    </div>`;
  $("btnCopyId").onclick = async () => {
    try { await navigator.clipboard.writeText(P.memberId); C.toast(L("انتسخ الرقم")); }
    catch(e){ C.toast(L("رقمك: ") + P.memberId); }
  };

  /* friend requests */
  const rw = $("reqWrap"), rl = $("reqList");
  rw.hidden = requests.length === 0;
  $("reqCount").textContent = requests.length ? L("{0} جديد", requests.length) : "";
  rl.innerHTML = "";
  requests.forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${avatar({ name: r.fromName, photo: r.fromPhoto })}
      <span class="fr-main"><b>${esc(r.fromName || L("عضو"))}</b>
        <span>${L("رقم العضوية")} ${esc(r.fromMemberId || "—")} · ${since(r.at)}</span>
      </span>
      <span class="req-btns">
        <button class="req-yes" aria-label="${L("قبول")}"><svg class="ic"><use href="#i-check"/></svg></button>
        <button class="req-no" aria-label="${L("رفض")}">✕</button>
      </span>`;
    li.querySelector(".req-yes").onclick = () => acceptRequest(r);
    li.querySelector(".req-no").onclick  = () => rejectRequest(r);
    rl.appendChild(li);
  });

  /* friends */
  $("friendEmpty").hidden = friends.length > 0;
  $("friendEmpty").textContent = L("ما عندك أصدقاء بعد. أضف صديق برقم عضويته.");
  renderFriendList();

  /* groups */
  const gl = $("groupList"); gl.innerHTML = "";
  $("groupEmpty").hidden = groups.length > 0;
  $("groupEmpty").textContent = L("ما أنت في أي قروب. أنشئ قروب أو انضم بكود من صديق.");
  groups.forEach(g => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${groupAvatar(g, 48)}
      <span class="gr-main"><b>${esc(g.name)}</b>
        <span>${(g.memberUids||[]).length} ${L("أعضاء")} · ${L("كود")} ${esc(g.code)}</span>
      </span>
      <svg class="ic gr-go"><use href="#i-back"/></svg>`;
    li.onclick = () => openGroup(g);
    gl.appendChild(li);
  });
}

/* ============================================================
   UI — group screen
   ============================================================ */
async function openGroup(g){
  await ensureAdmins(g);
  curGroup = g; gTab = "board";
  C.show("group");
  renderGroupHead();
  setTab("board");
}

function groupAvatar(g, size = 46){
  const st = `width:${size}px;height:${size}px`;
  return g.photo
    ? `<span class="gav" style="${st};background-image:url('${esc(g.photo)}')"></span>`
    : `<span class="gav ph" style="${st}"><svg class="ic"><use href="#i-friends"/></svg></span>`;
}

function renderGroupHead(){
  const g = curGroup;
  const admin = isAdminOf(g);
  $("gHead").innerHTML = `
    <div class="ghead-row">
      <button class="ghead-back" id="gBack" aria-label="${L("رجوع")}"><svg class="ic"><use href="#i-back"/></svg></button>
      <button class="gav-btn" id="gPhoto" ${admin ? "" : "disabled"} aria-label="${L("صورة القروب")}">
        ${groupAvatar(g, 46)}${admin ? `<i class="gav-edit"><svg class="ic"><use href="#i-edit"/></svg></i>` : ""}
      </button>
      <div class="ghead-main">
        <b id="gName">${esc(g.name)}${admin ? ` <svg class="ic gname-edit"><use href="#i-edit"/></svg>` : ""}</b>
        <span>${(g.memberUids||[]).length} ${L("أعضاء")}${admin ? L(" · أنت مشرف") : ""}</span>
      </div>
      <button class="ghead-exit" id="gLeave" aria-label="${L("مغادرة القروب")}"><svg class="ic"><use href="#i-exit"/></svg></button>
    </div>
    <button class="ghead-code" id="gCode">
      <svg class="ic"><use href="#i-share"/></svg>
      <span>${L("شارك كود الدعوة")}</span>
      <b>${esc(g.code)}</b>
    </button>`;
  $("gBack").onclick = () => { closeChat(); C.show("club"); };
  $("gLeave").onclick = () => leaveGroup(g);

  if (admin){
    $("gName").onclick = async () => {
      const v = await promptSheet(L("اسم القروب"), L("اكتب الاسم الجديد"), g.name);
      const name = (v || "").trim();
      if (!name || name === g.name) return;
      const { db, m } = fb();
      try {
        await m.updateDoc(m.doc(db, "groups", g.id), { name });
        g.name = name; renderGroupHead(); await loadGroups(); C.toast(L("انحفظ الاسم"));
      } catch(err){ console.error(err); C.toast(L("تعذّر التعديل")); }
    };
    $("gPhoto").onclick = async () => {
      const dataUrl = await pickGroupPhoto();
      if (!dataUrl) return;
      const { db, m } = fb();
      try {
        await m.updateDoc(m.doc(db, "groups", g.id), { photo: dataUrl });
        g.photo = dataUrl; renderGroupHead(); await loadGroups(); C.toast(L("انحفظت الصورة"));
      } catch(err){ console.error(err); C.toast(L("تعذّر حفظ الصورة")); }
    };
  }
  $("gCode").onclick = async () => {
    const txt = `${L("انضم لقروب «")}${g.name}» ${L("في نادي الجبال")}\n${L("الكود:")} ${g.code}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) await navigator.share({ text: txt });
      else { await navigator.clipboard.writeText(txt); C.toast(L("انتسخت الدعوة")); }
    } catch(e){ /* المستخدم ألغى المشاركة */ }
  };
  document.querySelectorAll("#gTabs button").forEach(b => {
    b.classList.toggle("on", b.dataset.gt === gTab);
    b.onclick = () => setTab(b.dataset.gt);
  });
}

function setTab(t){
  gTab = t;
  document.querySelectorAll("#gTabs button").forEach(b => b.classList.toggle("on", b.dataset.gt === t));
  closeChat();
  if (t === "board") tabBoard();
  if (t === "chal")  tabChallenge();
  if (t === "acts")  tabActivity();
  if (t === "chat")  tabChat();
  if (t === "plans") tabPlans();
}

/* ---------- النشاط ----------
   تمارين الأعضاء المكتملة، ولكل واحد تصفيقة تشجيع. */
function tabActivity(){
  const body = $("gBody"), g = curGroup, { db, m } = fb();
  body.innerHTML = `<p class="loading">${L("جارٍ التحميل…")}</p>`;

  const q = m.query(m.collection(db, "groups", g.id, "messages"),
                    m.orderBy("at", "desc"), m.limit(40));
  unsubChat = m.onSnapshot(q, snap => {
    if (gTab !== "acts") return;
    const acts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                     .filter(x => x.kind === "sys");
    if (!acts.length){
      body.innerHTML = `<p class="empty">${L("ما فيه نشاط بعد — أول تمرين يظهر هنا.")}</p>`;
      return;
    }
    body.innerHTML = `<ul class="acts">` + acts.map(a => {
      const n = (a.claps || []).length;
      const mine = (a.claps || []).includes(myUid());
      return `<li class="sys">
        <span class="sys-dot"></span>
        <span><b>${esc(a.name)}</b> ${esc(a.text)}<small>${since(a.at)}</small></span>
        <button class="clap ${mine ? "on" : ""}" data-id="${esc(a.id)}"
          ${a.uid === myUid() ? "disabled" : ""}>👏${n ? " " + n : ""}</button>
      </li>`;
    }).join("") + `</ul>`;

    body.querySelectorAll(".clap").forEach(b => {
      b.onclick = async () => {
        b.disabled = true;
        try {
          await m.updateDoc(m.doc(db, "groups", g.id, "messages", b.dataset.id),
                            { claps: m.arrayUnion(myUid()) });
        } catch(err){ console.error(err); b.disabled = false; }
      };
    });
  }, err => {
    console.error("activity", err);
    body.innerHTML = `<p class="empty">${L("تعذّر تحميل النشاط — تأكد من نشر قواعد")} Firestore.</p>`;
  });
}

/* ---------- قائمة الأصدقاء وترتيبها ----------
   الرموز بدل النص: 🔥 السلسلة · ⏱️ الدقائق · 🏋️ الأوزان */
const FR_SORTS = {
  streak: { icon:"🔥", label:"السلسلة", line: f => `${f.streak||0} ${L("يوم متتالٍ")}` },
  mins:   { icon:"⏱️", label:"الدقائق", line: f => `${thisWeek(f,"minsWeek")} ${L("دقيقة هذا الأسبوع")}` },
  vol:    { icon:"🏋️", label:"الأوزان", line: f => `${thisWeek(f,"volWeek")} ${L("كجم هذا الأسبوع")}` }
};
let frSort = "streak";

function frValue(f, key){
  return key === "streak" ? (f.streak || 0)
       : key === "mins"   ? thisWeek(f, "minsWeek")
       :                    thisWeek(f, "volWeek");
}

function renderFriendList(){
  const fl = $("friendList"); fl.innerHTML = "";

  const bar = $("frSort");
  bar.hidden = friends.length < 2;                  // صديق واحد لا يحتاج ترتيباً
  bar.innerHTML = Object.entries(FR_SORTS).map(([k, s]) =>
    `<button type="button" class="sort-chip${k === frSort ? " on" : ""}" data-fs="${k}"
       aria-label="${L("رتّب حسب")} ${L(s.label)}" title="${L(s.label)}">${s.icon}</button>`).join("");
  bar.querySelectorAll(".sort-chip").forEach(b => {
    b.onclick = () => { frSort = b.dataset.fs; renderFriendList(); };
  });

  const s = FR_SORTS[frSort] || FR_SORTS.streak;
  const rows = [...friends].sort((a, b) =>
    frValue(b, frSort) - frValue(a, frSort) || (b.week||0) - (a.week||0));

  rows.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${avatar(f)}
      <span class="fr-main"><b><span class="nm">${esc(f.name)}</span>${flame(f.streak)}</b>
        <span>${s.line(f)}${f.lastAt ? " · " + since(f.lastAt) : ""}</span>
      </span>
      <button class="fr-chat" aria-label="${L("محادثة")}"><svg class="ic"><use href="#i-send"/></svg></button>`;
    li.querySelector(".fr-chat").onclick = e => { e.stopPropagation(); openDM(f); };
    li.onclick = () => openFriendProfile(f);
    fl.appendChild(li);
  });
}

/* ---------- الترتيب ---------- */
/* ثلاثة تصنيفات، كلها على أساس هذا الأسبوع */
const BOARD_SORTS = {
  runs: { label:"بالتمرين", key:"week",     word:"تمرين هذا الأسبوع" },
  mins: { label:"بالدقائق", key:"minsWeek", word:"دقيقة هذا الأسبوع" },
  vol:  { label:"بالأوزان", key:"volWeek",  word:"كجم هذا الأسبوع" }
};
let boardSort = "runs";

/* عدّاد الأسبوع في الملف العام يبقى على قيمته حتى يتمرّن صاحبه،
   فنصفّره إذا كان محفوظاً من أسبوع فات */
const thisWeek = (p, key) => (p && p.weekKey === weekKey()) ? (p[key] || 0) : 0;

async function tabBoard(){
  const body = $("gBody");
  body.innerHTML = `<p class="loading">${L("جارٍ التحميل…")}</p>`;
  const profs = await loadProfiles(curGroup.memberUids || []);
  boardCache = profs;
  renderBoard(profs);
}

function renderBoard(profs){
  const body = $("gBody");
  const tabs = `<div class="pick-tabs board-tabs">` + Object.entries(BOARD_SORTS).map(([k, s]) =>
    `<button data-bs="${k}" class="${k === boardSort ? "on" : ""}">${L(s.label)}</button>`).join("") + `</div>`;

  const s = BOARD_SORTS[boardSort] || BOARD_SORTS.runs;
  const val = p => thisWeek(p, s.key);
  const rows = Object.values(profs).sort((a,b) =>
    val(b) - val(a) || (b.streak||0) - (a.streak||0) || (b.total||0) - (a.total||0));

  if (!rows.length){ body.innerHTML = tabs + `<p class="empty">${L("ما فيه أعضاء بعد.")}</p>`; return; }
  const medal = ["gold","silver","bronze"];
  body.innerHTML = tabs + `<ul class="board">` + rows.map((p, i) => `
    <li class="${p.uid === myUid() ? "me" : ""}">
      <span class="rank ${i < 3 && val(p) > 0 ? medal[i] : ""}">${i + 1}</span>
      ${avatar(p, 44)}
      <span class="bd-main"><b><span class="nm">${esc(p.name)}${p.uid === myUid() ? L(" (أنت)") : ""}</span>${
        groupAdmins(curGroup).includes(p.uid) ? `<i class="adm">${L("مشرف")}</i>` : ""}</b>
        <span>${val(p)} ${L(s.word)}${p.lastAt ? L(" · آخر تمرين ") + since(p.lastAt) : ""}</span>
      </span>
      ${flame(p.streak, true)}
      ${p.uid === myUid() ? "" : `<button class="bd-more" data-uid="${esc(p.uid)}" aria-label="${L("خيارات")}">⋯</button>`}
    </li>`).join("") + `</ul>`;

  body.querySelectorAll(".board-tabs button").forEach(b => {
    b.onclick = () => { boardSort = b.dataset.bs; renderBoard(profs); };
  });
  body.querySelectorAll(".bd-more").forEach(b => {
    b.onclick = e => { e.stopPropagation(); memberSheet(profs[b.dataset.uid]); };
  });
}

/* ---------- التحدي ---------- */
async function tabChallenge(){
  const body = $("gBody"), g = curGroup;
  const ch = g.challenge || { target: 5, weekKey: weekKey() };
  const profs = Object.keys(boardCache).length ? boardCache : await loadProfiles(g.memberUids || []);
  boardCache = profs;
  const wk = weekKey();
  const rows = Object.values(profs).sort((a,b) => (b.week||0) - (a.week||0));
  const doneCount = rows.filter(p => (p.weekKey === wk ? (p.week||0) : 0) >= ch.target).length;

  body.innerHTML = `
    <div class="chal">
      <p class="chal-eyebrow">${L("تحدي هذا الأسبوع")}</p>
      <p class="chal-target"><b>${ch.target}</b> ${L("تمارين لكل عضو")}</p>
      <p class="chal-sub">${doneCount} ${L("من")} ${rows.length} ${L("خلّصوا التحدي")}</p>
      ${g.ownerUid === myUid() ? `<button class="btn btn-soft" id="chalEdit">${L("غيّر الهدف")}</button>` : ""}
    </div>
    <ul class="chal-list">` + rows.map(p => {
      const w = p.weekKey === wk ? (p.week||0) : 0;
      const pct = Math.min(100, Math.round(w / Math.max(1, ch.target) * 100));
      return `<li>
        ${avatar(p, 40)}
        <span class="cl-main"><b>${esc(p.name)}</b>
          <span class="cl-bar"><i style="width:${pct}%"></i></span>
        </span>
        <span class="cl-num ${w >= ch.target ? "done" : ""}">${w}/${ch.target}</span>
      </li>`;
    }).join("") + `</ul>`;

  if (g.ownerUid === myUid()){
    $("chalEdit").onclick = async () => {
      const v = await promptSheet(L("هدف التحدي"), L("كم تمرين لكل عضو في الأسبوع؟"), String(ch.target));
      const n = parseInt(v, 10);
      if (!n || n < 1 || n > 30){ if (v !== null) C.toast(L("رقم بين ١ و ٣٠")); return; }
      const { db, m } = fb();
      try {
        await m.updateDoc(m.doc(db, "groups", g.id), { challenge: { target: n, weekKey: weekKey() } });
        g.challenge = { target: n, weekKey: weekKey() };
        tabChallenge(); C.toast(L("انحفظ الهدف"));
      } catch(err){ console.error(err); C.toast(L("تعذّر الحفظ")); }
    };
  }
}

/* ---------- المحادثة ---------- */
function closeChat(){ if (unsubChat){ unsubChat(); unsubChat = null; } }

function tabChat(){
  const body = $("gBody"), g = curGroup, { db, m } = fb();
  body.innerHTML = `
    <div class="chat" id="chatBox"><p class="loading">${L("جارٍ التحميل…")}</p></div>
    <div class="chat-bar">
      <input type="text" id="chatInput" placeholder="${L("اكتب رسالة…")}" autocomplete="off">
      <button class="btn btn-primary btn-sq" id="chatSend" aria-label="${L("إرسال")}"><svg class="ic"><use href="#i-send"/></svg></button>
    </div>`;

  const send = async () => {
    const el = $("chatInput"), text = el.value.trim();
    if (!text) return;
    el.value = "";
    try {
      await m.addDoc(m.collection(db, "groups", g.id, "messages"),
        { uid: myUid(), name: C.S.user.name, text, at: Date.now(), kind: "msg" });
    } catch(err){ console.error(err); C.toast(L("ما انرسلت الرسالة")); el.value = text; }
  };
  $("chatSend").onclick = send;
  $("chatInput").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); send(); } });

  const q = m.query(m.collection(db, "groups", g.id, "messages"), m.orderBy("at", "desc"), m.limit(60));
  unsubChat = m.onSnapshot(q, snap => {
    /* سجل النشاط القديم يُخفى — المحادثة للرسائل فقط */
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                     .filter(x => x.kind !== "sys").reverse();
    const box = $("chatBox"); if (!box) return;
    if (!msgs.length){ box.innerHTML = `<p class="empty">${L("ابدأ المحادثة — أول رسالة عليك.")}</p>`; return; }
    box.innerHTML = msgs.map(msg => {
      const mine = msg.uid === myUid();
      return `<div class="msg ${mine ? "mine" : ""}">
          ${mine ? "" : `<b>${esc(msg.name)}</b>`}
          <p>${esc(msg.text)}</p><small>${since(msg.at)}</small>
        </div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  }, err => {
    console.error("chat", err);
    const box = $("chatBox"); if (box) box.innerHTML = `<p class="empty">${L("تعذّر تحميل المحادثة — تأكد من نشر قواعد")} Firestore.</p>`;
  });
}

/* ---------- الجداول المشتركة ---------- */
async function tabPlans(){
  const body = $("gBody"), g = curGroup, { db, m } = fb();
  body.innerHTML = `<p class="loading">${L("جارٍ التحميل…")}</p>`;
  let list = [];
  try {
    const q = m.query(m.collection(db, "groups", g.id, "plans"), m.orderBy("at", "desc"), m.limit(30));
    list = (await m.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(err){ console.error(err); }

  body.innerHTML =
    `<button class="btn btn-soft" id="pubPlan"><svg class="ic"><use href="#i-share"/></svg><span>${L("انشر جدولاً للقروب")}</span></button>` +
    (list.length
      ? `<ul class="shared">` + list.map(p => `
          <li>
            <span class="sh-main"><b>${esc(p.name)}</b>
              <span>${L("من")} ${esc(p.byName)} · ${p.rounds} ${L("جولة")} · ${p.mins} ${L("دقيقة")}</span>
            </span>
            <button class="btn btn-soft btn-pill" data-copy="${p.id}">${L("انسخه لي")}</button>
          </li>`).join("") + `</ul>`
      : `<p class="empty">${L("ما فيه جداول منشورة بعد.")}</p>`);

  $("pubPlan").onclick = async () => {
    const names = C.S.plans.map(p => p.name);
    const i = await chooser(L("انشر جدولاً"), names);
    if (i < 0) return;
    const plan = C.S.plans[i];
    try {
      await m.addDoc(m.collection(db, "groups", g.id, "plans"), {
        name: plan.name, items: plan.items, repeat: plan.repeat || 1,
        warm: plan.warm || 0, cool: plan.cool || 0, target: plan.target || 0,
        rounds: C.planRounds(plan), mins: Math.round(C.planSeconds(plan)/60),
        byUid: myUid(), byName: C.S.user.name, at: Date.now()
      });
      tabPlans(); C.toast(L("انتشر الجدول للقروب"));
    } catch(err){ console.error(err); C.toast(L("تعذّر النشر")); }
  };

  body.querySelectorAll("[data-copy]").forEach(b => {
    b.onclick = async () => {
      const p = list.find(x => x.id === b.dataset.copy);
      await C.addPlanCopy({
        name: p.name + L(" (من ") + p.byName + ")",
        items: p.items, repeat: p.repeat, warm: p.warm, cool: p.cool, target: p.target
      });
      C.toast(L("انضاف لجداولك"));
    };
  });
}

/* ---------- خيارات عضو القروب ---------- */
async function memberSheet(p){
  if (!p) return;
  const g = curGroup;
  const admin = isAdminOf(g);
  const isFriend = friends.some(f => f.uid === p.uid);
  const pAdmin = groupAdmins(g).includes(p.uid);

  const acts = [];
  if (isFriend) acts.push({ t:L("افتح ملفه"), run: () => openFriendProfile(p) });
  else acts.push({ t:L("أرسل طلب صداقة"), run: () => sendRequestToUid(p) });
  if (admin && p.uid !== g.ownerUid){
    acts.push(pAdmin ? { t:L("أزل الإشراف"), run: () => setAdmin(p, false) }
                     : { t:L("اجعله مشرفاً"), run: () => setAdmin(p, true) });
    acts.push({ t:L("أزله من القروب"), run: () => kickMember(p) });
  }

  const i = await chooser(p.name, acts.map(a => a.t));
  if (i >= 0 && acts[i]) acts[i].run();
}

async function sendRequestToUid(p){
  const { db, m } = fb(), uid = myUid();
  if (p.uid === uid) return;
  try {
    const incoming = requests.find(r => r.from === p.uid);
    if (incoming){ await acceptRequest(incoming); return; }
    await m.setDoc(m.doc(db, "friendRequests", `${uid}_${p.uid}`), {
      from: uid, to: p.uid, fromName: C.S.user.name, fromPhoto: C.S.user.photo || "",
      fromMemberId: P ? P.memberId : "", at: Date.now()
    });
    C.toast(L("انرسل طلب صداقة لـ {0}", p.name));
  } catch(err){ console.error(err); C.toast(L("تعذّر إرسال الطلب")); }
}

async function setAdmin(p, on){
  const g = curGroup, { db, m } = fb();
  try {
    await m.updateDoc(m.doc(db, "groups", g.id),
      { admins: on ? m.arrayUnion(p.uid) : m.arrayRemove(p.uid) });
    const list = new Set(groupAdmins(g));
    on ? list.add(p.uid) : list.delete(p.uid);
    g.admins = [...list];
    renderGroupHead(); tabBoard();
    C.toast(on ? L("{0} صار مشرفاً", p.name) : L("انسحب الإشراف من {0}", p.name));
  } catch(err){ console.error(err); C.toast(L("تعذّر التعديل")); }
}

async function kickMember(p){
  const g = curGroup;
  const ok = await C.ask(L("إزالة عضو"), L("{0} راح ينحذف من {1}. يقدر يرجع بالكود.", p.name, g.name), L("أزله"));
  if (!ok) return;
  const { db, m } = fb();
  try {
    await m.updateDoc(m.doc(db, "groups", g.id), {
      memberUids: m.arrayRemove(p.uid),
      admins: m.arrayRemove(p.uid)
    });
    g.memberUids = (g.memberUids||[]).filter(u => u !== p.uid);
    g.admins = groupAdmins(g).filter(u => u !== p.uid);
    renderGroupHead(); tabBoard();
    C.toast(L("انحذف {0} من القروب", p.name));
  } catch(err){ console.error(err); C.toast(L("تعذّرت الإزالة")); }
}

/* ============================================================
   ملف الصديق — إحصائياته وتقدّمه وجداوله
   ============================================================ */
function weekStrip(days, frozen){
  const set = new Set(days || []);
  const fz  = new Set(frozen || []);
  const names = [L("ح"),L("ن"),L("ث"),L("ر"),L("خ"),L("ج"),L("س")];
  const full  = [L("الأحد"),L("الإثنين"),L("الثلاثاء"),L("الأربعاء"),L("الخميس"),L("الجمعة"),L("السبت")];
  let h = "";
  /* أسبوع تقويمي ثابت: الأحد أولاً — وفي RTL يظهر أقصى اليمين — والسبت آخراً */
  const t0 = new Date(); t0.setHours(0,0,0,0);
  const sun = new Date(t0); sun.setDate(sun.getDate() - sun.getDay());
  for (let i = 0; i < 7; i++){
    const d = new Date(sun); d.setDate(sun.getDate() + i);
    const k = C.dayKey(d), on = set.has(k), froze = !on && fz.has(k);
    const state = on ? L("تمرّنت") : froze ? L("محفوظ بتجميد")
                : d > t0 ? L("لم يأت بعد") : L("بدون تمرين");
    h += `<div class="fday${on ? " on" : froze ? " froze" : ""}${d > t0 ? " ahead" : ""}"`
       + ` role="img" aria-label="${full[d.getDay()]} — ${state}">`
       + `<i aria-hidden="true">${froze ? "❄️" : ""}</i>`
       + `<span aria-hidden="true">${names[d.getDay()]}</span></div>`;
  }
  return `<div class="fweek">${h}</div>`;
}

async function openFriendProfile(f){
  C.show("friend");
  const body = $("frBody");
  body.innerHTML = `<p class="loading">${L("جارٍ التحميل…")}</p>`;

  // نجيب أحدث نسخة من ملفه
  const fresh = (await loadProfiles([f.uid]))[f.uid] || f;
  const { db, m } = fb();
  let plans = [];
  try {
    const q = m.query(m.collection(db, "profiles", f.uid, "plans"), m.limit(20));
    plans = (await m.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }))
              .sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  } catch(err){ console.error("friend plans", err); }

  body.innerHTML = `
    <div class="ghead">
      <div class="ghead-row">
        <button class="ghead-back" id="frBack" aria-label="${L("رجوع")}"><svg class="ic"><use href="#i-back"/></svg></button>
        <div class="ghead-main"><b>${L("ملف الصديق")}</b><span>${L("رقم العضوية")} ${esc(fresh.memberId || "—")}</span></div>
        <button class="ghead-exit" id="frDel" aria-label="${L("حذف من الأصدقاء")}"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </div>

    <div class="fprof">
      ${avatar(fresh, 76)}
      <h2>${esc(fresh.name)} ${flame(fresh.streak, true)}</h2>
      <p>${fresh.lastAt ? L("آخر تمرين ") + since(fresh.lastAt) : L("ما سجّل تمارين بعد")}${
        fresh.badges ? ` ${L("· 🏅 {0} شارة", fresh.badges)}` : ""}</p>
      ${weekStrip(fresh.days, fresh.frozen)}
    </div>

    <div class="stats">
      <div class="stat"><span class="stat-ic s-rose"><svg class="ic"><use href="#i-check"/></svg></span>
        <strong>${fresh.total||0}</strong><small>${L("تمرين")}</small></div>
      <div class="stat"><span class="stat-ic s-gold"><svg class="ic"><use href="#i-trophy"/></svg></span>
        <strong>${fresh.best||0}</strong><small>${L("أطول سلسلة")}</small></div>
      <div class="stat"><span class="stat-ic s-plum"><svg class="ic"><use href="#i-timer"/></svg></span>
        <strong>${fresh.week||0}</strong><small>${L("هذا الأسبوع")}</small></div>
    </div>

    ${duelHTML(fresh)}

    <button class="btn btn-primary btn-lg" id="frChat"><svg class="ic"><use href="#i-send"/></svg><span>${L("محادثة")}</span></button>

    <h3 class="sub-head">${L("جداوله")}</h3>
    ${plans.length ? `<ul class="shared">` + plans.map(p => `
      <li>
        <span class="sh-main"><b>${esc(p.name)}</b><span>${p.rounds||0} ${L("جولة")} · ${p.mins||0} ${L("دقيقة")}</span></span>
        <button class="btn btn-soft btn-pill" data-fp="${esc(p.id)}">${L("انسخه لي")}</button>
      </li>`).join("") + `</ul>`
      : `<p class="empty">${L("ما نشر جداول بعد.")}</p>`}`;

  $("frBack").onclick = () => C.show("club");
  const ds = $("duelStart");
  if (ds) ds.onclick = () => startDuel(fresh);
  $("frChat").onclick = () => openDM(fresh);
  $("frDel").onclick  = async () => { await removeFriend(fresh.uid, fresh.name); C.show("club"); };
  body.querySelectorAll("[data-fp]").forEach(b => {
    b.onclick = async () => {
      const p = plans.find(x => x.id === b.dataset.fp);
      await C.addPlanCopy({ name: L("{0} (من {1})", p.name, fresh.name), items: p.items,
                            repeat: p.repeat, warm: p.warm, cool: p.cool, target: p.target });
      C.toast(L("انضاف لجداولك"));
    };
  });
}

/* ============================================================
   المحادثة الخاصة بين صديقين
   ============================================================ */
let unsubDM = null;
let dmWith = null;
function closeDM(){ if (unsubDM){ unsubDM(); unsubDM = null; } }

function planCardHTML(p, mid, mine){
  return `<div class="plan-msg${mine ? " mine" : ""}">
      <span class="pm-ic"><svg class="ic"><use href="#i-list"/></svg></span>
      <span class="pm-main"><b>${esc(p.name)}</b><span>${p.rounds||0} ${L("جولة")} · ${p.mins||0} ${L("دقيقة")}</span></span>
      <button class="btn btn-soft btn-pill" data-pm="${mid}">${L("انسخه لي")}</button>
    </div>`;
}

function openDM(f){
  dmWith = f;
  closeDM();
  C.show("dm");
  const { db, m } = fb();
  const pair = pairId(myUid(), f.uid);

  $("dmHead").innerHTML = `
    <div class="ghead-row">
      <button class="ghead-back" id="dmBack" aria-label="${L("رجوع")}"><svg class="ic"><use href="#i-back"/></svg></button>
      ${avatar(f, 42)}
      <div class="ghead-main"><b><span class="nm">${esc(f.name)}</span>${flame(f.streak)}</b>
        <span>${f.lastAt ? L("آخر تمرين ") + since(f.lastAt) : "—"}</span></div>
      <button class="ghead-prof" id="dmProf" aria-label="${L("ملفه")}"><svg class="ic"><use href="#i-user"/></svg></button>
    </div>`;
  $("dmBack").onclick = () => { closeDM(); C.show("club"); };
  $("dmProf").onclick = () => { closeDM(); openFriendProfile(f); };

  const send = async (extra) => {
    const el = $("dmInput");
    const text = extra ? "" : el.value.trim();
    if (!extra && !text) return;
    if (!extra) el.value = "";
    try {
      await m.setDoc(m.doc(db, "dms", pair), { a: pairId(myUid(), f.uid).split("_")[0],
        b: pairId(myUid(), f.uid).split("_")[1], at: Date.now() }, { merge: true });
      await m.addDoc(m.collection(db, "dms", pair, "messages"),
        { uid: myUid(), name: C.S.user.name, text, at: Date.now(), kind: extra ? "plan" : "msg",
          ...(extra ? { plan: extra } : {}) });
    } catch(err){ console.error(err); C.toast(L("ما انرسلت الرسالة")); if (!extra) el.value = text; }
  };
  $("dmSend").onclick = () => send(null);
  $("dmInput").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); send(null); } };
  $("dmPlan").onclick = async () => {
    const i = await chooser(L("شارك جدولاً"), C.S.plans.map(p => p.name));
    if (i < 0) return;
    const p = C.S.plans[i];
    await send({ name: p.name, items: p.items, repeat: p.repeat || 1, warm: p.warm || 0,
                 cool: p.cool || 0, target: p.target || 0,
                 rounds: C.planRounds(p), mins: Math.round(C.planSeconds(p)/60) });
    C.toast(L("انرسل الجدول"));
  };

  const q = m.query(m.collection(db, "dms", pair, "messages"), m.orderBy("at", "desc"), m.limit(60));
  unsubDM = m.onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    const box = $("dmBox"); if (!box) return;
    if (!msgs.length){ box.innerHTML = `<p class="empty">${L("ابدأ المحادثة مع")} ${esc(f.name)}.</p>`; return; }
    box.innerHTML = msgs.map(msg => {
      const mine = msg.uid === myUid();
      if (msg.kind === "plan" && msg.plan) return planCardHTML(msg.plan, msg.id, mine);
      return `<div class="msg ${mine ? "mine" : ""}"><p>${esc(msg.text)}</p><small>${since(msg.at)}</small></div>`;
    }).join("");
    box.querySelectorAll("[data-pm]").forEach(b => {
      b.onclick = async () => {
        const msg = msgs.find(x => x.id === b.dataset.pm);
        await C.addPlanCopy({ name: L("{0} (من {1})", msg.plan.name, msg.name), items: msg.plan.items,
          repeat: msg.plan.repeat, warm: msg.plan.warm, cool: msg.plan.cool, target: msg.plan.target });
        C.toast(L("انضاف لجداولك"));
      };
    });
    box.scrollTop = box.scrollHeight;
  }, err => {
    console.error("dm", err);
    const box = $("dmBox"); if (box) box.innerHTML = `<p class="empty">${L("تعذّر تحميل المحادثة — تأكد من نشر قواعد")} Firestore.</p>`;
  });
}

/* ============================================================
   نسخة معروضة من جداولي يشوفها أصدقائي
   ============================================================ */
export async function publishMyPlan(plan){
  if (!isCloud()) return;
  const { db, m } = fb();
  try {
    await m.setDoc(m.doc(db, "profiles", myUid(), "plans", plan.id), {
      name: plan.name, items: plan.items, repeat: plan.repeat || 1,
      warm: plan.warm || 0, cool: plan.cool || 0, target: plan.target || 0,
      rounds: C.planRounds(plan), mins: Math.round(C.planSeconds(plan)/60),
      updatedAt: Date.now()
    });
  } catch(err){ console.error("publishMyPlan", err); }
}

export async function unpublishMyPlan(planId){
  if (!isCloud()) return;
  const { db, m } = fb();
  try { await m.deleteDoc(m.doc(db, "profiles", myUid(), "plans", planId)); }
  catch(err){ console.error("unpublishMyPlan", err); }
}

/* ============================================================
   small sheets
   ============================================================ */
const $ = id => document.getElementById(id);

function promptSheet(title, text, value = ""){
  return new Promise(resolve => {
    $("pmTitle").textContent = title;
    $("pmText").textContent = text;
    const inp = $("pmInput");
    inp.value = value;
    $("prompt").hidden = false;
    setTimeout(() => inp.focus(), 50);
    const done = v => {
      $("prompt").hidden = true;
      $("pmOk").onclick = null; $("pmNo").onclick = null; inp.onkeydown = null;
      resolve(v);
    };
    $("pmOk").onclick = () => done(inp.value);
    $("pmNo").onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); done(inp.value); } };
  });
}

function chooser(title, items){
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = `<div class="sheet">
        <p class="sheet-name">${esc(title)}</p>
        ${items.map((t,i) => `<button class="btn btn-soft" data-i="${i}">${esc(t)}</button>`).join("")}
        <button class="btn btn-ghost" data-i="-1">${L("إلغاء")}</button>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll("button").forEach(b => {
      b.onclick = () => { const i = +b.dataset.i; wrap.remove(); resolve(i); };
    });
    wrap.onclick = e => { if (e.target === wrap){ wrap.remove(); resolve(-1); } };
  });
}

/* ============================================================
   boot / teardown
   ============================================================ */
export function initSocial(ctx){
  C = ctx;
  $("btnAddFriend").onclick = async () => {
    if (!isCloud()){ C.toast(L("سجّل دخولك أولاً")); return; }
    const v = await promptSheet(L("أضف صديق"), L("اكتب رقم عضوية صديقك (٦ أرقام) — يوصله طلب يقبله أو يرفضه"), "");
    if (v !== null) sendRequest(v);
  };
  $("btnNewGroup").onclick = async () => {
    if (!isCloud()){ C.toast(L("سجّل دخولك أولاً")); return; }
    const v = await promptSheet(L("قروب جديد"), L("وش اسم القروب؟"), "");
    if (v !== null) createGroup(v);
  };
  $("btnJoinGroup").onclick = async () => {
    if (!isCloud()){ C.toast(L("سجّل دخولك أولاً")); return; }
    const v = await promptSheet(L("انضم لقروب"), L("اكتب كود الدعوة (٦ خانات)"), "");
    if (v !== null) joinByCode(v);
  };
  $("prompt").addEventListener("click", e => { if (e.target.id === "prompt") $("pmNo").click(); });
}

export async function socialBoot(){
  if (!isCloud()){ P = null; friends = []; groups = []; requests = []; renderClub(); return; }
  try { await ensureProfile(); } catch(err){ console.error("profile", err); }
  await loadRequests();
  await loadFriends();
  await loadGroups();
  await loadDuels();
  await pushDuelScores();
  renderClub();
  // ننشر نسخة معروضة من جداولي عشان يشوفها أصدقائي
  for (const p of C.S.plans) publishMyPlan(p);
}

export function socialTeardown(){
  closeChat(); closeDM();
  P = null; friends = []; groups = []; requests = []; curGroup = null; dmWith = null;
  boardCache = {}; duels = {};
}

export function memberId(){ return P ? P.memberId : null; }
export async function refreshClub(){ await loadRequests(); await loadFriends(); await loadGroups(); renderClub(); }
