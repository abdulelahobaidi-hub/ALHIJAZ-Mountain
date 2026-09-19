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
    lastAt: done.length ? done[0].at : 0
  };
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

async function addFriendById(raw){
  const id = String(raw || "").replace(/\D/g, "");
  if (id.length !== 6){ C.toast("رقم العضوية ٦ أرقام"); return; }
  const { db, m } = fb(), uid = myUid();
  try {
    const snap = await m.getDoc(m.doc(db, "memberIds", id));
    if (!snap.exists()){ C.toast("ما فيه عضو بهذا الرقم"); return; }
    const other = snap.data().uid;
    if (other === uid){ C.toast("هذا رقمك أنت"); return; }
    await m.setDoc(m.doc(db, "friendships", pairId(uid, other)),
                   { a: uid, b: other, at: Date.now() });
    await loadFriends();
    renderClub();
    C.toast("انضاف لقائمة أصدقائك");
  } catch(err){ console.error(err); C.toast("تعذّرت الإضافة — تأكد من قواعد Firestore"); }
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
      name, code, ownerUid: uid, memberUids: [uid],
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

/* ============================================================
   WORKOUT HOOK
   ============================================================ */
export async function socialAfterWorkout(sess){
  if (!isCloud()) return;
  await syncProfile();
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

  /* friends */
  const fl = $("friendList"); fl.innerHTML = "";
  $("friendEmpty").hidden = friends.length > 0;
  $("friendEmpty").textContent = "ما عندك أصدقاء بعد. أضف صديق برقم عضويته.";
  friends.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${avatar(f)}
      <span class="fr-main"><b>${esc(f.name)}</b>
        <span>${f.streak||0} يوم متتالي · ${f.week||0} هذا الأسبوع${f.lastAt ? " · " + since(f.lastAt) : ""}</span>
      </span>
      <button class="fr-del" aria-label="حذف"><svg class="ic"><use href="#i-trash"/></svg></button>`;
    li.querySelector(".fr-del").onclick = () => removeFriend(f.uid, f.name);
    fl.appendChild(li);
  });

  /* groups */
  const gl = $("groupList"); gl.innerHTML = "";
  $("groupEmpty").hidden = groups.length > 0;
  $("groupEmpty").textContent = "ما أنت في أي قروب. أنشئ قروب أو انضم بكود من صديق.";
  groups.forEach(g => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="gr-ic"><svg class="ic"><use href="#i-friends"/></svg></span>
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
  curGroup = g; gTab = "board";
  C.show("group");
  renderGroupHead();
  setTab("board");
}

function renderGroupHead(){
  const g = curGroup;
  $("gHead").innerHTML = `
    <div class="ghead-row">
      <button class="ghead-back" id="gBack" aria-label="رجوع"><svg class="ic"><use href="#i-back"/></svg></button>
      <div class="ghead-main">
        <b>${esc(g.name)}</b>
        <span>${(g.memberUids||[]).length} أعضاء</span>
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
      <span class="bd-main"><b>${esc(p.name)}${p.uid === myUid() ? " (أنت)" : ""}</b>
        <span>${p.week||0} تمرين هذا الأسبوع${p.lastAt ? " · آخر تمرين " + since(p.lastAt) : ""}</span>
      </span>
      <span class="bd-streak"><b>${p.streak||0}</b>يوم</span>
    </li>`).join("") + `</ul>`;
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
    const v = await promptSheet("أضف صديق", "اكتب رقم عضوية صديقك (٦ أرقام)", "");
    if (v !== null) addFriendById(v);
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
  if (!isCloud()){ P = null; friends = []; groups = []; renderClub(); return; }
  try { await ensureProfile(); } catch(err){ console.error("profile", err); }
  await loadFriends();
  await loadGroups();
  renderClub();
}

export function socialTeardown(){
  closeChat(); P = null; friends = []; groups = []; curGroup = null; boardCache = {};
}

export function memberId(){ return P ? P.memberId : null; }
export async function refreshClub(){ await loadFriends(); await loadGroups(); renderClub(); }
