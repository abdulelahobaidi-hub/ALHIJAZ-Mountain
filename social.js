/* ============================================================
   نادي جبال الحجاز — الأصدقاء والقروبات
   profiles/{uid}              الملف العام (رقم العضوية + الستريك)
   memberIds/{memberId}        بحث عن العضو برقمه
   friendships/{a_b}           صداقة بين طرفين
   groups/{gid}                القروب وأعضاؤه وتحدّيه
   groups/{gid}/messages/{id}  المحادثة وسجل النشاط
   groups/{gid}/plans/{id}     الجداول المنشورة للقروب
   groupCodes/{CODE}           بحث عن القروب بكود الدعوة
   ============================================================ */

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
  if (s < 60) return "الحين";
  if (s < 3600) return `قبل ${Math.floor(s/60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s/3600)} ساعة`;
  if (s < 604800) return `قبل ${Math.floor(s/86400)} يوم`;
  return new Date(ms).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { day:"numeric", month:"short" });
}

function avatar(p, size = 46){
  const st = `width:${size}px;height:${size}px`;
  return p && p.photo
    ? `<span class="av" style="${st};background-image:url('${esc(p.photo)}')"></span>`
    : `<span class="av" style="${st}">${esc(((p && p.name) || "؟").trim().charAt(0))}</span>`;
}

/* ---------- my stats ---------- */
function myStats(){
  const st = C.streakInfo();
  const done = C.S.sessions.filter(s => s.completed !== false);
  const ws = weekStart();
  return {
    streak: st.current,
    best: st.best,
    week: done.filter(s => s.at >= ws).length,
    total: done.length,
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
      (await m.getDocs(q)).forEach(d => { out[d.id] = { uid: d.id, ...d.data() }; });
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
  if (id.length !== 6){ C.toast("رقم العضوية ٦ أرقام"); return; }
  const { db, m } = fb(), uid = myUid();
  try {
    const snap = await m.getDoc(m.doc(db, "memberIds", id));
    if (!snap.exists()){ C.toast("ما فيه عضو بهذا الرقم"); return; }
    const other = snap.data().uid;
    if (other === uid){ C.toast("هذا رقمك أنت"); return; }
    if (friends.some(f => f.uid === other)){ C.toast("هو أصلاً في قائمة أصدقائك"); return; }

    // لو هو أرسل لي طلب من قبل — نقبله مباشرة بدل ما نرسل طلباً مضاداً
    const incoming = requests.find(r => r.from === other);
    if (incoming){ await acceptRequest(incoming); return; }

    await m.setDoc(m.doc(db, "friendRequests", `${uid}_${other}`), {
      from: uid, to: other,
      fromName: C.S.user.name, fromPhoto: C.S.user.photo || "",
      fromMemberId: P ? P.memberId : "", at: Date.now()
    });
    C.toast("انرسل الطلب — ينتظر قبوله");
  } catch(err){ console.error(err); C.toast("تعذّر إرسال الطلب"); }
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
    C.toast(`صرتوا أصدقاء — ${req.fromName || ""}`.trim());
  } catch(err){ console.error(err); C.toast("تعذّر القبول"); }
}

async function rejectRequest(req){
  const { db, m } = fb();
  try {
    await m.deleteDoc(m.doc(db, "friendRequests", req.id));
    await loadRequests(); renderClub();
    C.toast("انرفض الطلب");
  } catch(err){ console.error(err); C.toast("تعذّر الرفض"); }
}

async function removeFriend(other, name){
  const ok = await C.ask("حذف صديق", `${name} راح ينحذف من قائمتك.`);
  if (!ok) return;
  const { db, m } = fb();
  try {
    await m.deleteDoc(m.doc(db, "friendships", pairId(myUid(), other)));
    await loadFriends(); renderClub(); C.toast("انحذف");
  } catch(err){ console.error(err); C.toast("تعذّر الحذف"); }
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
  if (!name){ C.toast("اكتب اسم القروب"); return; }
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
    C.toast(`انشأ القروب — كود الدعوة ${code}`);
  } catch(err){ console.error(err); C.toast("تعذّر إنشاء القروب — تأكد من قواعد Firestore"); }
}

async function joinByCode(raw){
  const code = String(raw || "").trim().toUpperCase();
  if (code.length !== 6){ C.toast("الكود ٦ خانات"); return; }
  const { db, m } = fb(), uid = myUid();
  try {
    const snap = await m.getDoc(m.doc(db, "groupCodes", code));
    if (!snap.exists()){ C.toast("كود غير صحيح"); return; }
    const gid = snap.data().gid;
    await m.updateDoc(m.doc(db, "groups", gid), { memberUids: m.arrayUnion(uid) });
    await loadGroups(); renderClub();
    C.toast("انضممت للقروب");
  } catch(err){ console.error(err); C.toast("تعذّر الانضمام"); }
}

async function leaveGroup(g){
  const ok = await C.ask("مغادرة القروب", `${g.name} — تقدر ترجع بنفس الكود.`, "غادر");
  if (!ok) return;
  const { db, m } = fb();
  try {
    await m.updateDoc(m.doc(db, "groups", g.id), { memberUids: m.arrayRemove(myUid()) });
    closeChat(); curGroup = null;
    await loadGroups(); C.show("club"); C.toast("غادرت القروب");
  } catch(err){ console.error(err); C.toast("تعذّرت المغادرة"); }
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
    C.toast("بدأ التحدي — أسبوع من الحين");
    openFriendProfile(f);
  } catch(err){ console.error(err); C.toast("تعذّر بدء التحدي"); }
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
      <svg class="ic"><use href="#i-trophy"/></svg><span>تحدَّه أسبوعاً</span></button>`;

  const mine = d.a === myUid() ? d.scoreA : d.scoreB;
  const his  = d.a === myUid() ? d.scoreB : d.scoreA;
  const over = Date.now() > d.endAt;
  const left = Math.max(0, Math.ceil((d.endAt - Date.now()) / 86400000));
  const verdict = over
    ? (mine === his ? "تعادل" : mine > his ? "فزت 🎉" : `فاز ${esc(f.name)}`)
    : `باقي ${left} ${left === 1 ? "يوم" : "أيام"}`;
  return `
    <div class="duel${over ? " over" : ""}">
      <p class="duel-top">تحدي الأسبوع</p>
      <div class="duel-row">
        <span class="duel-side${mine >= his ? " lead" : ""}"><b>${mine}</b><span>أنت</span></span>
        <span class="duel-vs">VS</span>
        <span class="duel-side${his >= mine ? " lead" : ""}"><b>${his}</b><span>${esc(f.name)}</span></span>
      </div>
      <p class="duel-foot">${verdict}</p>
    </div>`;
}

/* ============================================================
   WORKOUT HOOK
   ============================================================ */
export async function socialAfterWorkout(sess){
  if (!isCloud()) return;
  await syncProfile();
  await pushDuelScores();
  if (!groups.length) await loadGroups();
  const { db, m } = fb();
  const text = `خلّص ${sess.planName || "تمرين"} — ${sess.rounds} جولة`;
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
        <p><b>القروبات تحتاج حساب</b></p>
        <p class="muted">سجّل دخولك بجوجل عشان يكون لك رقم عضوية وتقدر تضيف أصدقاء وتنشئ قروبات.</p>
      </div>`;
    $("friendList").innerHTML = ""; $("groupList").innerHTML = "";
    $("friendEmpty").hidden = false; $("groupEmpty").hidden = false;
    $("friendEmpty").textContent = "سجّل دخولك عشان تضيف أصدقاء.";
    $("groupEmpty").textContent  = "سجّل دخولك عشان تنشئ قروب.";
    return;
  }

  const s = myStats();
  me.innerHTML = `
    <div class="me-top">
      ${avatar(P, 58)}
      <div class="me-id">
        <b>${esc(P ? P.name : C.S.user.name)}</b>
        <span>رقم عضويتك</span>
        <p class="member-id">${esc(P ? P.memberId : "—")}</p>
      </div>
      <button class="btn btn-soft btn-sq sm" id="btnCopyId" aria-label="انسخ الرقم">
        <svg class="ic"><use href="#i-copy"/></svg>
      </button>
    </div>
    <div class="me-stats">
      <span><b>${s.streak}</b>أيام متتالية</span>
      <span><b>${s.week}</b>هذا الأسبوع</span>
      <span><b>${s.total}</b>تمرين</span>
    </div>`;
  $("btnCopyId").onclick = async () => {
    try { await navigator.clipboard.writeText(P.memberId); C.toast("انتسخ الرقم"); }
    catch(e){ C.toast("رقمك: " + P.memberId); }
  };

  /* friend requests */
  const rw = $("reqWrap"), rl = $("reqList");
  rw.hidden = requests.length === 0;
  $("reqCount").textContent = requests.length ? `${requests.length} جديد` : "";
  rl.innerHTML = "";
  requests.forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${avatar({ name: r.fromName, photo: r.fromPhoto })}
      <span class="fr-main"><b>${esc(r.fromName || "عضو")}</b>
        <span>رقم العضوية ${esc(r.fromMemberId || "—")} · ${since(r.at)}</span>
      </span>
      <span class="req-btns">
        <button class="req-yes" aria-label="قبول"><svg class="ic"><use href="#i-check"/></svg></button>
        <button class="req-no" aria-label="رفض">✕</button>
      </span>`;
    li.querySelector(".req-yes").onclick = () => acceptRequest(r);
    li.querySelector(".req-no").onclick  = () => rejectRequest(r);
    rl.appendChild(li);
  });

  /* friends */
  const fl = $("friendList"); fl.innerHTML = "";
  $("friendEmpty").hidden = friends.length > 0;
  $("friendEmpty").textContent = "ما عندك أصدقاء بعد. أضف صديق برقم عضويته.";
  friends.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${avatar(f)}
      <span class="fr-main"><b><span class="nm">${esc(f.name)}</span>${flame(f.streak)}</b>
        <span>${f.week||0} تمرين هذا الأسبوع${f.lastAt ? " · " + since(f.lastAt) : ""}</span>
      </span>
      <button class="fr-chat" aria-label="محادثة"><svg class="ic"><use href="#i-send"/></svg></button>`;
    li.querySelector(".fr-chat").onclick = e => { e.stopPropagation(); openDM(f); };
    li.onclick = () => openFriendProfile(f);
    fl.appendChild(li);
  });

  /* groups */
  const gl = $("groupList"); gl.innerHTML = "";
  $("groupEmpty").hidden = groups.length > 0;
  $("groupEmpty").textContent = "ما أنت في أي قروب. أنشئ قروب أو انضم بكود من صديق.";
  groups.forEach(g => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${groupAvatar(g, 48)}
      <span class="gr-main"><b>${esc(g.name)}</b>
        <span>${(g.memberUids||[]).length} أعضاء · كود ${esc(g.code)}</span>
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
      <button class="ghead-back" id="gBack" aria-label="رجوع"><svg class="ic"><use href="#i-back"/></svg></button>
      <button class="gav-btn" id="gPhoto" ${admin ? "" : "disabled"} aria-label="صورة القروب">
        ${groupAvatar(g, 46)}${admin ? `<i class="gav-edit"><svg class="ic"><use href="#i-edit"/></svg></i>` : ""}
      </button>
      <div class="ghead-main">
        <b id="gName">${esc(g.name)}${admin ? ` <svg class="ic gname-edit"><use href="#i-edit"/></svg>` : ""}</b>
        <span>${(g.memberUids||[]).length} أعضاء${admin ? " · أنت مشرف" : ""}</span>
      </div>
      <button class="ghead-exit" id="gLeave" aria-label="مغادرة القروب"><svg class="ic"><use href="#i-exit"/></svg></button>
    </div>
    <button class="ghead-code" id="gCode">
      <svg class="ic"><use href="#i-share"/></svg>
      <span>شارك كود الدعوة</span>
      <b>${esc(g.code)}</b>
    </button>`;
  $("gBack").onclick = () => { closeChat(); C.show("club"); };
  $("gLeave").onclick = () => leaveGroup(g);

  if (admin){
    $("gName").onclick = async () => {
      const v = await promptSheet("اسم القروب", "اكتب الاسم الجديد", g.name);
      const name = (v || "").trim();
      if (!name || name === g.name) return;
      const { db, m } = fb();
      try {
        await m.updateDoc(m.doc(db, "groups", g.id), { name });
        g.name = name; renderGroupHead(); await loadGroups(); C.toast("انحفظ الاسم");
      } catch(err){ console.error(err); C.toast("تعذّر التعديل"); }
    };
    $("gPhoto").onclick = async () => {
      const dataUrl = await pickGroupPhoto();
      if (!dataUrl) return;
      const { db, m } = fb();
      try {
        await m.updateDoc(m.doc(db, "groups", g.id), { photo: dataUrl });
        g.photo = dataUrl; renderGroupHead(); await loadGroups(); C.toast("انحفظت الصورة");
      } catch(err){ console.error(err); C.toast("تعذّر حفظ الصورة"); }
    };
  }
  $("gCode").onclick = async () => {
    const txt = `انضم لقروب «${g.name}» في نادي جبال الحجاز\nالكود: ${g.code}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) await navigator.share({ text: txt });
      else { await navigator.clipboard.writeText(txt); C.toast("انتسخت الدعوة"); }
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
  if (t === "chat")  tabChat();
  if (t === "plans") tabPlans();
}

/* ---------- الترتيب ---------- */
async function tabBoard(){
  const body = $("gBody");
  body.innerHTML = `<p class="loading">جارٍ التحميل…</p>`;
  const profs = await loadProfiles(curGroup.memberUids || []);
  boardCache = profs;
  const rows = Object.values(profs).sort((a,b) =>
    (b.streak||0) - (a.streak||0) || (b.week||0) - (a.week||0) || (b.total||0) - (a.total||0));
  if (!rows.length){ body.innerHTML = `<p class="empty">ما فيه أعضاء بعد.</p>`; return; }
  const medal = ["gold","silver","bronze"];
  body.innerHTML = `<ul class="board">` + rows.map((p, i) => `
    <li class="${p.uid === myUid() ? "me" : ""}">
      <span class="rank ${i < 3 ? medal[i] : ""}">${i + 1}</span>
      ${avatar(p, 44)}
      <span class="bd-main"><b><span class="nm">${esc(p.name)}${p.uid === myUid() ? " (أنت)" : ""}</span>${
        groupAdmins(curGroup).includes(p.uid) ? `<i class="adm">مشرف</i>` : ""}</b>
        <span>${p.week||0} تمرين هذا الأسبوع${p.lastAt ? " · آخر تمرين " + since(p.lastAt) : ""}</span>
      </span>
      ${flame(p.streak, true)}
      ${p.uid === myUid() ? "" : `<button class="bd-more" data-uid="${esc(p.uid)}" aria-label="خيارات">⋯</button>`}
    </li>`).join("") + `</ul>`;

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
      <p class="chal-eyebrow">تحدي هذا الأسبوع</p>
      <p class="chal-target"><b>${ch.target}</b> تمارين لكل عضو</p>
      <p class="chal-sub">${doneCount} من ${rows.length} خلّصوا التحدي</p>
      ${g.ownerUid === myUid() ? `<button class="btn btn-soft" id="chalEdit">غيّر الهدف</button>` : ""}
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
      const v = await promptSheet("هدف التحدي", "كم تمرين لكل عضو في الأسبوع؟", String(ch.target));
      const n = parseInt(v, 10);
      if (!n || n < 1 || n > 30){ if (v !== null) C.toast("رقم بين ١ و ٣٠"); return; }
      const { db, m } = fb();
      try {
        await m.updateDoc(m.doc(db, "groups", g.id), { challenge: { target: n, weekKey: weekKey() } });
        g.challenge = { target: n, weekKey: weekKey() };
        tabChallenge(); C.toast("انحفظ الهدف");
      } catch(err){ console.error(err); C.toast("تعذّر الحفظ"); }
    };
  }
}

/* ---------- المحادثة ---------- */
function closeChat(){ if (unsubChat){ unsubChat(); unsubChat = null; } }

function tabChat(){
  const body = $("gBody"), g = curGroup, { db, m } = fb();
  body.innerHTML = `
    <div class="chat" id="chatBox"><p class="loading">جارٍ التحميل…</p></div>
    <div class="chat-bar">
      <input type="text" id="chatInput" placeholder="اكتب رسالة…" autocomplete="off">
      <button class="btn btn-primary btn-sq" id="chatSend" aria-label="إرسال"><svg class="ic"><use href="#i-send"/></svg></button>
    </div>`;

  const send = async () => {
    const el = $("chatInput"), text = el.value.trim();
    if (!text) return;
    el.value = "";
    try {
      await m.addDoc(m.collection(db, "groups", g.id, "messages"),
        { uid: myUid(), name: C.S.user.name, text, at: Date.now(), kind: "msg", claps: [] });
    } catch(err){ console.error(err); C.toast("ما انرسلت الرسالة"); el.value = text; }
  };
  $("chatSend").onclick = send;
  $("chatInput").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); send(); } });

  const q = m.query(m.collection(db, "groups", g.id, "messages"), m.orderBy("at", "desc"), m.limit(60));
  unsubChat = m.onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    const box = $("chatBox"); if (!box) return;
    if (!msgs.length){ box.innerHTML = `<p class="empty">ابدأ المحادثة — أول رسالة عليك.</p>`; return; }
    box.innerHTML = msgs.map(msg => {
      const mine = msg.uid === myUid();
      const claps = (msg.claps || []).length;
      if (msg.kind === "sys")
        return `<div class="sys" data-id="${msg.id}">
            <span class="sys-dot"></span>
            <span><b>${esc(msg.name)}</b> ${esc(msg.text)}<small>${since(msg.at)}</small></span>
            <button class="clap ${(msg.claps||[]).includes(myUid()) ? "on" : ""}" data-id="${msg.id}">👏${claps ? " " + claps : ""}</button>
          </div>`;
      return `<div class="msg ${mine ? "mine" : ""}">
          ${mine ? "" : `<b>${esc(msg.name)}</b>`}
          <p>${esc(msg.text)}</p><small>${since(msg.at)}</small>
        </div>`;
    }).join("");
    box.querySelectorAll(".clap").forEach(b => {
      b.onclick = async () => {
        try {
          await m.updateDoc(m.doc(db, "groups", g.id, "messages", b.dataset.id),
                            { claps: m.arrayUnion(myUid()) });
        } catch(err){ console.error(err); }
      };
    });
    box.scrollTop = box.scrollHeight;
  }, err => {
    console.error("chat", err);
    const box = $("chatBox"); if (box) box.innerHTML = `<p class="empty">تعذّر تحميل المحادثة — تأكد من نشر قواعد Firestore.</p>`;
  });
}

/* ---------- الجداول المشتركة ---------- */
async function tabPlans(){
  const body = $("gBody"), g = curGroup, { db, m } = fb();
  body.innerHTML = `<p class="loading">جارٍ التحميل…</p>`;
  let list = [];
  try {
    const q = m.query(m.collection(db, "groups", g.id, "plans"), m.orderBy("at", "desc"), m.limit(30));
    list = (await m.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(err){ console.error(err); }

  body.innerHTML =
    `<button class="btn btn-soft" id="pubPlan"><svg class="ic"><use href="#i-share"/></svg><span>انشر جدولاً للقروب</span></button>` +
    (list.length
      ? `<ul class="shared">` + list.map(p => `
          <li>
            <span class="sh-main"><b>${esc(p.name)}</b>
              <span>من ${esc(p.byName)} · ${p.rounds} جولة · ${p.mins} دقيقة</span>
            </span>
            <button class="btn btn-soft btn-pill" data-copy="${p.id}">انسخه لي</button>
          </li>`).join("") + `</ul>`
      : `<p class="empty">ما فيه جداول منشورة بعد.</p>`);

  $("pubPlan").onclick = async () => {
    const names = C.S.plans.map(p => p.name);
    const i = await chooser("انشر جدولاً", names);
    if (i < 0) return;
    const plan = C.S.plans[i];
    try {
      await m.addDoc(m.collection(db, "groups", g.id, "plans"), {
        name: plan.name, items: plan.items, repeat: plan.repeat || 1,
        warm: plan.warm || 0, cool: plan.cool || 0, target: plan.target || 0,
        rounds: C.planRounds(plan), mins: Math.round(C.planSeconds(plan)/60),
        byUid: myUid(), byName: C.S.user.name, at: Date.now()
      });
      tabPlans(); C.toast("انتشر الجدول للقروب");
    } catch(err){ console.error(err); C.toast("تعذّر النشر"); }
  };

  body.querySelectorAll("[data-copy]").forEach(b => {
    b.onclick = async () => {
      const p = list.find(x => x.id === b.dataset.copy);
      await C.addPlanCopy({
        name: p.name + " (من " + p.byName + ")",
        items: p.items, repeat: p.repeat, warm: p.warm, cool: p.cool, target: p.target
      });
      C.toast("انضاف لجداولك");
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
  if (isFriend) acts.push({ t:"افتح ملفه", run: () => openFriendProfile(p) });
  else acts.push({ t:"أرسل طلب صداقة", run: () => sendRequestToUid(p) });
  if (admin && p.uid !== g.ownerUid){
    acts.push(pAdmin ? { t:"أزل الإشراف", run: () => setAdmin(p, false) }
                     : { t:"اجعله مشرفاً", run: () => setAdmin(p, true) });
    acts.push({ t:"أزله من القروب", run: () => kickMember(p) });
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
    C.toast(`انرسل طلب صداقة لـ ${p.name}`);
  } catch(err){ console.error(err); C.toast("تعذّر إرسال الطلب"); }
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
    C.toast(on ? `${p.name} صار مشرفاً` : `انسحب الإشراف من ${p.name}`);
  } catch(err){ console.error(err); C.toast("تعذّر التعديل"); }
}

async function kickMember(p){
  const g = curGroup;
  const ok = await C.ask("إزالة عضو", `${p.name} راح ينحذف من ${g.name}. يقدر يرجع بالكود.`, "أزله");
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
    C.toast(`انحذف ${p.name} من القروب`);
  } catch(err){ console.error(err); C.toast("تعذّرت الإزالة"); }
}

/* ============================================================
   ملف الصديق — إحصائياته وتقدّمه وجداوله
   ============================================================ */
function weekStrip(days, frozen){
  const set = new Set(days || []);
  const fz  = new Set(frozen || []);
  const names = ["ح","ن","ث","ر","خ","ج","س"];
  let h = "";
  for (let i = 6; i >= 0; i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const k = C.dayKey(d), on = set.has(k), froze = !on && fz.has(k);
    h += `<div class="fday${on ? " on" : froze ? " froze" : ""}"><i>${froze ? "❄️" : ""}</i>${names[d.getDay()]}</div>`;
  }
  return `<div class="fweek">${h}</div>`;
}

async function openFriendProfile(f){
  C.show("friend");
  const body = $("frBody");
  body.innerHTML = `<p class="loading">جارٍ التحميل…</p>`;

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
        <button class="ghead-back" id="frBack" aria-label="رجوع"><svg class="ic"><use href="#i-back"/></svg></button>
        <div class="ghead-main"><b>ملف الصديق</b><span>رقم العضوية ${esc(fresh.memberId || "—")}</span></div>
        <button class="ghead-exit" id="frDel" aria-label="حذف من الأصدقاء"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </div>

    <div class="fprof">
      ${avatar(fresh, 76)}
      <h2>${esc(fresh.name)} ${flame(fresh.streak, true)}</h2>
      <p>${fresh.lastAt ? "آخر تمرين " + since(fresh.lastAt) : "ما سجّل تمارين بعد"}${
        fresh.badges ? ` · 🏅 ${fresh.badges} شارة` : ""}</p>
      ${weekStrip(fresh.days, fresh.frozen)}
    </div>

    <div class="stats">
      <div class="stat"><span class="stat-ic s-rose"><svg class="ic"><use href="#i-check"/></svg></span>
        <strong>${fresh.total||0}</strong><small>تمرين</small></div>
      <div class="stat"><span class="stat-ic s-gold"><svg class="ic"><use href="#i-trophy"/></svg></span>
        <strong>${fresh.best||0}</strong><small>أطول سلسلة</small></div>
      <div class="stat"><span class="stat-ic s-plum"><svg class="ic"><use href="#i-timer"/></svg></span>
        <strong>${fresh.week||0}</strong><small>هذا الأسبوع</small></div>
    </div>

    ${duelHTML(fresh)}

    <button class="btn btn-primary btn-lg" id="frChat"><svg class="ic"><use href="#i-send"/></svg><span>محادثة</span></button>

    <h3 class="sub-head">جداوله</h3>
    ${plans.length ? `<ul class="shared">` + plans.map(p => `
      <li>
        <span class="sh-main"><b>${esc(p.name)}</b><span>${p.rounds||0} جولة · ${p.mins||0} دقيقة</span></span>
        <button class="btn btn-soft btn-pill" data-fp="${esc(p.id)}">انسخه لي</button>
      </li>`).join("") + `</ul>`
      : `<p class="empty">ما نشر جداول بعد.</p>`}`;

  $("frBack").onclick = () => C.show("club");
  const ds = $("duelStart");
  if (ds) ds.onclick = () => startDuel(fresh);
  $("frChat").onclick = () => openDM(fresh);
  $("frDel").onclick  = async () => { await removeFriend(fresh.uid, fresh.name); C.show("club"); };
  body.querySelectorAll("[data-fp]").forEach(b => {
    b.onclick = async () => {
      const p = plans.find(x => x.id === b.dataset.fp);
      await C.addPlanCopy({ name: `${p.name} (من ${fresh.name})`, items: p.items,
                            repeat: p.repeat, warm: p.warm, cool: p.cool, target: p.target });
      C.toast("انضاف لجداولك");
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
      <span class="pm-main"><b>${esc(p.name)}</b><span>${p.rounds||0} جولة · ${p.mins||0} دقيقة</span></span>
      <button class="btn btn-soft btn-pill" data-pm="${mid}">انسخه لي</button>
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
      <button class="ghead-back" id="dmBack" aria-label="رجوع"><svg class="ic"><use href="#i-back"/></svg></button>
      ${avatar(f, 42)}
      <div class="ghead-main"><b><span class="nm">${esc(f.name)}</span>${flame(f.streak)}</b>
        <span>${f.lastAt ? "آخر تمرين " + since(f.lastAt) : "—"}</span></div>
      <button class="ghead-prof" id="dmProf" aria-label="ملفه"><svg class="ic"><use href="#i-user"/></svg></button>
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
    } catch(err){ console.error(err); C.toast("ما انرسلت الرسالة"); if (!extra) el.value = text; }
  };
  $("dmSend").onclick = () => send(null);
  $("dmInput").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); send(null); } };
  $("dmPlan").onclick = async () => {
    const i = await chooser("شارك جدولاً", C.S.plans.map(p => p.name));
    if (i < 0) return;
    const p = C.S.plans[i];
    await send({ name: p.name, items: p.items, repeat: p.repeat || 1, warm: p.warm || 0,
                 cool: p.cool || 0, target: p.target || 0,
                 rounds: C.planRounds(p), mins: Math.round(C.planSeconds(p)/60) });
    C.toast("انرسل الجدول");
  };

  const q = m.query(m.collection(db, "dms", pair, "messages"), m.orderBy("at", "desc"), m.limit(60));
  unsubDM = m.onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    const box = $("dmBox"); if (!box) return;
    if (!msgs.length){ box.innerHTML = `<p class="empty">ابدأ المحادثة مع ${esc(f.name)}.</p>`; return; }
    box.innerHTML = msgs.map(msg => {
      const mine = msg.uid === myUid();
      if (msg.kind === "plan" && msg.plan) return planCardHTML(msg.plan, msg.id, mine);
      return `<div class="msg ${mine ? "mine" : ""}"><p>${esc(msg.text)}</p><small>${since(msg.at)}</small></div>`;
    }).join("");
    box.querySelectorAll("[data-pm]").forEach(b => {
      b.onclick = async () => {
        const msg = msgs.find(x => x.id === b.dataset.pm);
        await C.addPlanCopy({ name: `${msg.plan.name} (من ${msg.name})`, items: msg.plan.items,
          repeat: msg.plan.repeat, warm: msg.plan.warm, cool: msg.plan.cool, target: msg.plan.target });
        C.toast("انضاف لجداولك");
      };
    });
    box.scrollTop = box.scrollHeight;
  }, err => {
    console.error("dm", err);
    const box = $("dmBox"); if (box) box.innerHTML = `<p class="empty">تعذّر تحميل المحادثة — تأكد من نشر قواعد Firestore.</p>`;
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
        <button class="btn btn-ghost" data-i="-1">إلغاء</button>
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
    if (!isCloud()){ C.toast("سجّل دخولك أولاً"); return; }
    const v = await promptSheet("أضف صديق", "اكتب رقم عضوية صديقك (٦ أرقام) — يوصله طلب يقبله أو يرفضه", "");
    if (v !== null) sendRequest(v);
  };
  $("btnNewGroup").onclick = async () => {
    if (!isCloud()){ C.toast("سجّل دخولك أولاً"); return; }
    const v = await promptSheet("قروب جديد", "وش اسم القروب؟", "");
    if (v !== null) createGroup(v);
  };
  $("btnJoinGroup").onclick = async () => {
    if (!isCloud()){ C.toast("سجّل دخولك أولاً"); return; }
    const v = await promptSheet("انضم لقروب", "اكتب كود الدعوة (٦ خانات)", "");
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
