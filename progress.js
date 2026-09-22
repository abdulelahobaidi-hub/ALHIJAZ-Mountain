/* ============================================================
   نادي الجبال — لوحة التقدّم والشارات
   كل شي هنا يُحسب من سجل تمارينك المحلي — بدون أي قراءة إضافية
   ============================================================ */

import { L, LOC } from "./i18n.js";

let C = null;
export function initProgress(ctx){ C = ctx; }

const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const DAY = 86400000;
const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
function startOfWeek(d){ const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }

/* ============================================================
   نطاق الشهر
   ============================================================
   كل أرقام هذه الصفحة للشهر الجاري وحده — يدخل شهر جديد
   فتبدأ العدادات من الصفر. الشارات وحدها تبقى تراكمية،
   لأنها إنجازات لا عدادات. */
function monthStart(d = Date.now()){
  const x = new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x;
}
function monthEnd(d = Date.now()){
  const x = monthStart(d); x.setMonth(x.getMonth() + 1); return x;
}
const monthName = () => new Date().toLocaleDateString(LOC(), { month:"long", year:"numeric" });

/* تمارين الشهر الجاري — الأساس لكل بطاقة هنا */
function monthSessions(){
  const a = monthStart().getTime(), b = monthEnd().getTime();
  return C.S.sessions.filter(s => s.completed !== false && s.at >= a && s.at < b);
}

/* ============================================================
   الشارات
   ============================================================ */
export function badgeList(){
  const done = C.S.sessions.filter(s => s.completed !== false);
  const st   = C.streakInfo();
  const mins = Math.round(done.reduce((a,s) => a + (s.secs||0), 0) / 60);
  const hours = new Set(done.map(s => new Date(s.at).getHours()));
  const dawn  = [...hours].some(h => h >= 4 && h < 7);
  const owl   = [...hours].some(h => h >= 23 || h < 3);

  // أكمل أسبوع: ٧ أيام تدريب داخل أسبوع واحد
  const byWeek = {};
  done.forEach(s => {
    const k = C.dayKey(startOfWeek(s.at));
    (byWeek[k] = byWeek[k] || new Set()).add(C.dayKey(s.at));
  });
  const fullWeek = Object.values(byWeek).some(set => set.size >= 7);
  const vol = Math.round(done.reduce((a,s) => a + (+s.volume||0), 0));

  const defs = [
    { id:"first",  icon:"🌄", name:L("أول خطوة"),      desc:L("أول تمرين مكتمل"),        now:Math.min(done.length,1), goal:1 },
    { id:"w10",    icon:"💪", name:L("عشرة"),           desc:L("١٠ تمارين"),              now:done.length, goal:10 },
    { id:"w50",    icon:"🎯", name:L("خمسين"),          desc:L("٥٠ تمريناً"),             now:done.length, goal:50 },
    { id:"w100",   icon:"🏅", name:L("مئة"),            desc:L("١٠٠ تمرين"),              now:done.length, goal:100 },
    { id:"s7",     icon:"🔥", name:L("أسبوع متواصل"),   desc:L("٧ أيام متتالية"),         now:st.best, goal:7 },
    { id:"s14",    icon:"⛰️", name:L("أسبوعان"),        desc:L("١٤ يوماً متتالياً"),      now:st.best, goal:14 },
    { id:"s30",    icon:"🏔️", name:L("شهر كامل"),       desc:L("٣٠ يوماً متتالياً"),      now:st.best, goal:30 },
    { id:"s100",   icon:"👑", name:L("قمة الجبال"),     desc:L("١٠٠ يوم متتالٍ"),         now:st.best, goal:100 },
    { id:"m500",   icon:"⏱️", name:L("٥٠٠ دقيقة"),      desc:L("٥٠٠ دقيقة تدريب"),        now:mins, goal:500 },
    { id:"m2000",  icon:"🕰️", name:L("٢٠٠٠ دقيقة"),     desc:L("٢٠٠٠ دقيقة تدريب"),       now:mins, goal:2000 },
    { id:"week7",  icon:"📅", name:L("أسبوع بلا راحة"), desc:L("٧ أيام تدريب في أسبوع"),  now:fullWeek?1:0, goal:1 },
    { id:"dawn",   icon:"🌅", name:L("قبل الفجر"),      desc:L("تمرين قبل ٧ صباحاً"),     now:dawn?1:0, goal:1 },
    { id:"owl",    icon:"🦉", name:L("بومة الليل"),     desc:L("تمرين بعد ١١ مساءً"),     now:owl?1:0, goal:1 },
    { id:"v1k",    icon:"🏋️", name:L("أول طن"),         desc:L("١٠٠٠ كجم حجم رفع"),       now:vol, goal:1000 },
    { id:"v10k",   icon:"⚙️", name:L("عشرة أطنان"),     desc:L("١٠٬٠٠٠ كجم حجم رفع"),     now:vol, goal:10000 }
  ];
  return defs.map(b => ({ ...b, done: b.now >= b.goal, pct: Math.min(100, Math.round(b.now / b.goal * 100)) }));
}

export const badgeCount = () => badgeList().filter(b => b.done).length;

function badgesHTML(){
  const list = badgeList();
  const got = list.filter(b => b.done).length;
  return `
    <div class="head-row"><h2>${L("الشارات")}</h2><span class="count">${got} ${L("من")} ${list.length}</span></div>
    <div class="badges">` + list.map(b => `
      <div class="badge${b.done ? " on" : ""}" title="${esc(b.desc)}">
        <span class="bg-ic">${b.icon}</span>
        <b>${esc(b.name)}</b>
        <span>${b.done ? esc(b.desc) : L("{0} من {1}", b.now, b.goal)}</span>
        ${b.done ? "" : `<i class="bg-bar"><u style="width:${b.pct}%"></u></i>`}
      </div>`).join("") + `</div>`;
}

/* ============================================================
   الرسوم
   ============================================================ */
/* الجدول الأسبوعي إلى الأمام: S.week يربط كل يوم بجدول أو براحة.
   تُعرض في تبويب «الجداول» تحت خطة الأسبوع، لا هنا. */
function slotOf(d){
  const s = (C.S.week || [])[d.getDay()] || "";
  if (!s || s === "rest") return null;
  return (C.S.plans || []).find(x => x.id === s) || null;
}
const hasSchedule = () => (C.S.week || []).some(s => s && s !== "rest");

/* أقرب التمارين المخطّطة */
function upcomingList(limit = 6, horizon = 35){
  const out = [];
  const t0 = startOfDay(Date.now());
  const done = new Set(C.S.sessions.filter(s => s.completed !== false).map(s => C.dayKey(s.at)));
  for (let i = 0; i < horizon && out.length < limit; i++){
    const d = new Date(t0.getTime() + i * DAY);
    const p = slotOf(d);
    if (!p) continue;
    out.push({ at:d, plan:p, today:i === 0, done: i === 0 && done.has(C.dayKey(d)) });
  }
  return out;
}

export function upcomingHTML(){
  if (!hasSchedule()){
    return `<p class="empty">${L("ما رتّبت أسبوعك بعد — اضغط أي يوم فوق وحدد جدوله.")}</p>`;
  }
  const rows = upcomingList();
  if (!rows.length){
    return `<p class="empty">${L("أيام أسبوعك مربوطة بجداول محذوفة — راجع ترتيب الأسبوع.")}</p>`;
  }
  const dayNm = d => d.toLocaleDateString(LOC(), { weekday:"long" });
  const dayDt = d => d.toLocaleDateString(LOC(), { day:"numeric", month:"long" });

  return `<ul class="upnext">` + rows.map(r => `
    <li class="up${r.today ? " now" : ""}${r.done ? " ok" : ""}">
      <span class="up-when"><b>${esc(dayNm(r.at))}</b><small>${esc(dayDt(r.at))}</small></span>
      <span class="up-main">
        <b>${esc(r.plan.name)}</b>
        <span>${C.planRounds ? C.planRounds(r.plan) : ""} ${L("جولة")}</span>
      </span>
      ${r.today ? `<span class="up-tag">${r.done ? L("تمّ") : L("اليوم")}</span>` : ""}
    </li>`).join("") + `</ul>`;
}

/* عدد التمارين لكل أسبوع داخل الشهر الجاري */
function monthWeeks(){
  const a = monthStart(), b = monthEnd();
  const rows = monthSessions();
  const out = [];
  let from = startOfWeek(a);                    // الأسبوع الذي يبدأ فيه الشهر
  while (from < b){
    const to = new Date(from.getTime() + 7 * DAY);
    const inWeek = rows.filter(s => s.at >= from.getTime() && s.at < to.getTime());
    out.push({
      from: new Date(Math.max(from.getTime(), a.getTime())),
      count: inWeek.length,
      mins: Math.round(inWeek.reduce((n, s) => n + (s.secs||0), 0) / 60)
    });
    from = to;
  }
  return out;
}

function columnsHTML(){
  const weeks = monthWeeks();
  const total = weeks.reduce((n, w) => n + w.count, 0);
  const max = Math.max(1, ...weeks.map(w => w.count));
  const now = Date.now();
  const fmt = d => d.toLocaleDateString(LOC(), { day:"numeric", month:"numeric" });

  return `
    <div class="card chart">
      <div class="chart-head">
        <h3>${esc(monthName())}</h3>
        <span>${L("{0} تمريناً هذا الشهر", total)}</span>
      </div>
      <div class="cols" role="img"
           aria-label="${L("عدد التمارين لكل أسبوع خلال {0}", monthName())}">
        ${weeks.map((w, i) => {
          const to = new Date(w.from.getTime() + 7 * DAY);
          const isNow = now >= w.from.getTime() && now < to.getTime();
          return `
          <div class="col${isNow ? " now" : ""}"
               data-tip="${L("أسبوع {0}", i + 1)} · ${fmt(w.from)} · ${w.count} ${L("تمرين")} · ${w.mins} ${L("دقيقة")}">
            ${w.count ? `<u>${w.count}</u>` : ""}
            <i style="height:${Math.round(w.count / max * 100)}%"></i>
          </div>`;
        }).join("")}
      </div>
      <div class="chart-foot">
        <span>${L("أول الشهر")}</span><span>${L("آخر الشهر")}</span>
      </div>
    </div>`;
}

function plansHTML(){
  const done = monthSessions();
  if (!done.length) return "";
  const by = {};
  done.forEach(s => { const k = s.planName || L("تمرين"); by[k] = (by[k]||0) + 1; });
  const rows = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,4);
  const max = rows[0][1];
  return `
    <div class="card chart">
      <div class="chart-head"><h3>${L("أكثر جداولك استخداماً")}</h3></div>
      <div class="hbars">` + rows.map(([n,c]) => `
        <div class="hbar">
          <span class="hb-name">${esc(L(n))}</span>
          <span class="hb-track"><i style="width:${Math.round(c/max*100)}%"></i></span>
          <b>${c}</b>
        </div>`).join("") + `</div>
    </div>`;
}

/* ---------- الأوزان ---------- */
/* أقصى وزن متوقع لمرة واحدة — معادلة إيبلي */
export const oneRM = (w, reps) =>
  Math.round((+w||0) * (1 + Math.max(1,+reps||1) / 30) * 2) / 2;

/* خطوة الزيادة: الأوزان الثقيلة تزيد ٥ والخفيفة ٢٫٥ */
const step = w => (w >= 40 ? 5 : 2.5);

function liftRows(){
  const map = new Map();
  monthSessions().filter(s => s.lifts && s.lifts.length)
    .slice().sort((a,b) => a.at - b.at)               // من الأقدم للأحدث
    .forEach(s => s.lifts.forEach(l => {
      const cur = map.get(l.name) ||
        { name:l.name, best:0, first:0, last:0, lastReps:0, vol:0, times:0, hist:[] };
      const w = +l.weight || 0;
      if (!cur.times) cur.first = w;
      cur.best = Math.max(cur.best, w); cur.last = w; cur.lastReps = +l.reps || 0;
      cur.times++; cur.hist.push(w);
      cur.vol += (+l.sets||0) * (+l.reps||0) * w;
      map.set(l.name, cur);
    }));
  return [...map.values()].map(r => {
    const tail = r.hist.slice(-3);
    r.rm = oneRM(r.last, r.lastReps);
    /* ثبت على نفس الوزن ثلاث مرات (أو مرتين لو ما عنده أكثر) — وقت الزيادة */
    r.ready = tail.length >= 2 && tail.every(w => w === r.last) && r.last > 0;
    r.next = r.last + step(r.last);
    return r;
  }).sort((a,b) => b.vol - a.vol);
}
export const totalVolume = () =>
  Math.round(C.S.sessions.filter(s => s.completed !== false).reduce((a,s) => a + (+s.volume||0), 0));

function liftsHTML(){
  const rows = liftRows();
  if (!rows.length) return "";
  const max = Math.max(...rows.map(r => r.best), 1);
  return `
    <div class="card chart">
      <div class="chart-head">
        <h3>${L("أوزانك")}</h3>
        <button class="btn-mini" id="btnRM">${L("حاسبة")}</button>
      </div>
      <p class="chart-sub">${totalVolume().toLocaleString("en-US")} ${L("كجم إجمالاً")}</p>
      <div class="lifts">` + rows.slice(0,6).map(r => `
        <div class="lift-row">
          <div class="lift-item" data-tip="${esc(L(r.name))} · ${L("أفضل")} ${r.best} ${L("كجم")} · ${r.times} ${L("مجموعة")} · ${Math.round(r.vol).toLocaleString("en-US")} ${L("كجم حجم")}">
            <span class="li-name">${esc(L(r.name))}</span>
            <span class="li-track"><i style="width:${Math.round(r.best / max * 100)}%"></i></span>
            <b>${r.best}<small>${L("كجم")}</small></b>
            ${r.last > r.first ? `<span class="lift-up">+${Math.round((r.last - r.first) * 10) / 10}</span>` : ""}
          </div>
          <p class="li-sub">
            <span>${L("أقصى وزن متوقع {0} كجم", r.rm)}</span>
            ${r.ready ? `<b class="li-go">${L("جاهز تزيد إلى {0} كجم", r.next)}</b>` : ""}
          </p>
        </div>`).join("") + `</div>
    </div>`;
}

/* ---------- الوزن والقياسات ---------- */
const fmtN = n => (Math.round(n * 10) / 10).toString();

function bodyLine(rows){                       // rows: من الأقدم للأحدث
  const W = 320, H = 132, padT = 14, padB = 24, padX = 14;
  const ys = rows.map(r => r.weight);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = (hi - lo) || 2;
  const y0 = lo - span * 0.35, y1 = hi + span * 0.35;
  const rtl = document.documentElement.dir !== "ltr";
  const n = rows.length;
  const stepX = n > 1 ? (W - padX * 2) / (n - 1) : 0;
  const X = i => rtl ? (W - padX - i * stepX) : (padX + i * stepX);
  const Y = v => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);

  const pts = rows.map((r, i) => [X(i), Y(r.weight)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = n > 1 ? `${path} L${pts[n-1][0].toFixed(1)} ${H-padB} L${pts[0][0].toFixed(1)} ${H-padB} Z` : "";
  const fmtD = at => new Date(at).toLocaleDateString(LOC(), { day:"numeric", month:"short" });

  return `
    <svg class="bline" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${L("تغيّر وزنك عبر الوقت")}">
      <line class="bl-grid" x1="0" y1="${H-padB}" x2="${W}" y2="${H-padB}"/>
      ${area ? `<path class="bl-area" d="${area}"/>` : ""}
      ${n > 1 ? `<path class="bl-line" d="${path}"/>` : ""}
      ${pts.map((p, i) => `
        <circle class="bl-dot${i === n-1 ? " last" : ""}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5"
          data-tip="${fmtD(rows[i].at)} · ${fmtN(rows[i].weight)} ${L("كجم")}"/>`).join("")}
    </svg>
    <div class="chart-foot"><span>${fmtD(rows[0].at)}</span><span>${fmtD(rows[n-1].at)}</span></div>`;
}

function deltaChip(now, was, unit, lowerBetter){
  if (!now || !was || now === was) return "";
  const d = Math.round((now - was) * 10) / 10;
  const good = lowerBetter ? d < 0 : d > 0;
  return `<span class="bd-delta ${good ? "good" : "up"}">${d > 0 ? "+" : ""}${fmtN(d)} ${unit}</span>`;
}

/* ============================================================
   مؤشرات الجسم
   ============================================================
   مؤشران معروفان يُحسبان من قياسات المستخدم نفسه:
   كتلة الجسم (BMI) ونسبة الخصر إلى الطول (WHtR).
   كلاهما مؤشر فرز عام لا تشخيص — والنص يقول ذلك صراحة،
   ولا نعرض أي هدف وزن ولا سعرات ولا نصيحة غذائية. */
const BMI_BANDS = [
  { max: 18.5, key:"low",  name:() => L("أقل من النطاق المعتاد") },
  { max: 25,   key:"ok",   name:() => L("ضمن النطاق المعتاد") },
  { max: 30,   key:"up",   name:() => L("أعلى من النطاق المعتاد") },
  { max: 1e9,  key:"up2",  name:() => L("أعلى بكثير من النطاق المعتاد") }
];

function bodyMetrics(){
  const info = C.S.bodyInfo || {};
  const h = +info.height || 0;
  const all = (C.S.body || []).slice().sort((a,b) => a.at - b.at);
  const last = all[all.length-1];
  if (!last || !h) return null;

  const out = { height:h, sex:info.sex || "", at:last.at };
  if (last.weight > 0){
    const m = h / 100;
    out.bmi = Math.round(last.weight / (m*m) * 10) / 10;
    out.bmiBand = BMI_BANDS.find(b => out.bmi < b.max);
  }
  if (last.waist > 0){
    out.whtr = Math.round(last.waist / h * 100) / 100;
    out.whtrKey = out.whtr < 0.5 ? "ok" : out.whtr < 0.6 ? "up" : "up2";
    out.waist = last.waist;
    /* عتبات محيط الخصر تختلف بين الذكر والأنثى — لهذا نسأل عن الجنس */
    const band = out.sex === "f" ? [80, 88] : out.sex === "m" ? [94, 102] : null;
    if (band){
      out.waistKey = out.waist < band[0] ? "ok" : out.waist < band[1] ? "up" : "up2";
      out.waistBand = band;
    }
  }
  return out;
}

function healthHTML(){
  const m = bodyMetrics();
  if (!m) return "";
  if (m.bmi == null && m.whtr == null) return "";

  const chip = (k) => k === "ok" ? "good" : k === "low" ? "warn" : "warn";
  const days = Math.round((Date.now() - m.at) / DAY);
  const stale = days >= 7;

  const bmiRow = m.bmi == null ? "" : `
    <div class="hm">
      <div class="hm-top"><span>${L("كتلة الجسم")}</span><b>${m.bmi}</b></div>
      <span class="hm-tag ${chip(m.bmiBand.key)}">${m.bmiBand.name()}</span>
      <p class="hm-note">${L("يُحسب من وزنك وطولك، ولا يفرّق بين العضل والدهن — فقد يظهر مرتفعاً لمن يتمرّن بالأوزان.")}</p>
    </div>`;

  const whtrRow = m.whtr == null ? "" : `
    <div class="hm">
      <div class="hm-top"><span>${L("الخصر إلى الطول")}</span><b>${m.whtr.toFixed(2)}</b></div>
      <span class="hm-tag ${chip(m.whtrKey)}">${
        m.whtrKey === "ok" ? L("ضمن النطاق المعتاد") : L("أعلى من النطاق المعتاد")}</span>
      <p class="hm-note">${L("النطاق المعتاد أقل من ٠٫٥ — أي أن خصرك أقل من نصف طولك.")}</p>
    </div>`;

  const waistRow = m.waistKey == null ? "" : `
    <div class="hm">
      <div class="hm-top"><span>${L("محيط الخصر")}</span><b>${m.waist}<small> ${L("سم")}</small></b></div>
      <span class="hm-tag ${chip(m.waistKey)}">${
        m.waistKey === "ok" ? L("ضمن النطاق المعتاد") : L("أعلى من النطاق المعتاد")}</span>
      <p class="hm-note">${L("النطاق المعتاد أقل من {0} سم حسب الجنس الذي اخترته.", m.waistBand[0])}</p>
    </div>`;

  return `
    <div class="card chart">
      <div class="chart-head">
        <h3>${L("مؤشرات جسمك")}</h3>
        <span>${days === 0 ? L("قياس اليوم") : L("قياس قبل {0} يوم", days)}</span>
      </div>
      ${bmiRow}${whtrRow}${waistRow}
      ${stale ? `<p class="hm-stale">${L("مرّ أسبوع أو أكثر على آخر قياس — حدّث وزنك ليبقى المؤشر معبّراً عن حالتك.")}</p>`
              : `<p class="hm-note">${L("حدّث قياساتك مرة كل أسبوع ليتابع المؤشر تغيّرك.")}</p>`}
      <p class="hm-warn">${L("هذه مؤشرات عامة للمتابعة الشخصية، وليست تشخيصاً طبياً. لأي قرار يخص صحتك راجع مختصاً.")}</p>
    </div>`;
}

function bodyHTML(){
  const all = (C.S.body || []).slice().sort((a,b) => a.at - b.at);
  if (!all.length){
    return `
      <div class="card chart">
        <div class="chart-head"><h3>${L("وزنك وقياساتك")}</h3>
          <button class="btn-mini" id="btnBody">${L("أضف قياس")}</button></div>
        <p class="chart-sub">${L("سجّل وزنك اليوم وشوف التغيّر مع تمارينك.")}</p>
      </div>`;
  }
  const last = all[all.length-1];
  const wRows = all.filter(r => r.weight > 0);
  const base = wRows.length > 1 ? wRows[0] : null;   // أول قياس — المقارنة منه

  const rowsHTML = [
    ["waist", L("الخصر"), L("سم"), true],
    ["chest", L("الصدر"), L("سم"), false],
    ["arm",   L("الذراع"), L("سم"), false]
  ].filter(([k]) => last[k] > 0).map(([k, name, unit, lower]) => {
    const was = all.find(r => r[k] > 0);
    return `<div class="bd-m"><span>${name}</span><b>${fmtN(last[k])}<small>${unit}</small></b>
              ${was && was !== last ? deltaChip(last[k], was[k], unit, lower) : ""}</div>`;
  }).join("");

  return `
    <div class="card chart">
      <div class="chart-head"><h3>${L("وزنك وقياساتك")}</h3>
        <button class="btn-mini" id="btnBody">${L("أضف قياس")}</button></div>
      ${last.weight ? `
        <p class="bd-now"><b>${fmtN(last.weight)}</b><small>${L("كجم")}</small>
          ${base ? deltaChip(last.weight, base.weight, L("كجم"), true) : ""}</p>
        ${base ? `<p class="bd-since">${L("مقارنة بأول قياس")}</p>` : ""}` : ""}
      ${wRows.length > 1 ? bodyLine(wRows) : ""}
      ${rowsHTML ? `<div class="bd-ms">${rowsHTML}</div>` : ""}
      <div class="bd-log">` + all.slice().reverse().slice(0,4).map(r => `
        <div class="bd-line">
          <span>${new Date(r.at).toLocaleDateString(LOC(), { day:"numeric", month:"long" })}</span>
          <b>${[r.weight && fmtN(r.weight) + " " + L("كجم"),
                r.waist && L("الخصر") + " " + fmtN(r.waist),
                r.chest && L("الصدر") + " " + fmtN(r.chest),
                r.arm   && L("الذراع") + " " + fmtN(r.arm)].filter(Boolean).join(" · ")}</b>
          <button class="bd-del" data-id="${r.id}" aria-label="${L("حذف القياس")}">
            <svg class="ic"><use href="#i-trash"/></svg></button>
        </div>`).join("") + `</div>
    </div>`;
}

function kpisHTML(){
  const month = monthSessions();
  const weeks = monthWeeks();
  const active = weeks.filter(w => w.from.getTime() <= Date.now()).length || 1;
  const avg = (month.length / active).toFixed(1).replace(/\.0$/, "");
  const mins = Math.round(month.reduce((a,s) => a + (s.secs||0), 0) / 60);
  return `
    <div class="stats">
      <div class="stat"><span class="stat-ic s-rose"><svg class="ic"><use href="#i-check"/></svg></span>
        <strong>${month.length}</strong><small>${L("تمرين هذا الشهر")}</small></div>
      <div class="stat"><span class="stat-ic s-gold"><svg class="ic"><use href="#i-timer"/></svg></span>
        <strong>${mins}</strong><small>${L("دقيقة هذا الشهر")}</small></div>
      <div class="stat"><span class="stat-ic s-plum"><svg class="ic"><use href="#i-trophy"/></svg></span>
        <strong>${avg}</strong><small>${L("معدل الأسبوع")}</small></div>
    </div>`;
}

/* ============================================================
   العرض
   ============================================================ */
export function renderProgress(){
  const box = document.getElementById("progressBox");
  if (!box) return;
  const done = monthSessions();
  if (!done.length){
    box.innerHTML = `<p class="empty">${L("ما سجّلت تمريناً هذا الشهر بعد — أول تمرين يبدأ العدّاد.")}</p>`
      + bodyHTML() + healthHTML() + badgesHTML();
  } else {
    box.innerHTML = kpisHTML() + columnsHTML() + bodyHTML() + healthHTML()
                  + liftsHTML() + plansHTML() + badgesHTML();
  }
  wireTips(box);
  const rm = document.getElementById("btnRM");
  if (rm && C.openRM) rm.onclick = () => C.openRM();
  const bd = document.getElementById("btnBody");
  if (bd && C.openBody) bd.onclick = () => C.openBody();
  box.querySelectorAll(".bd-del").forEach(el => {
    el.onclick = () => C.delBody && C.delBody(el.dataset.id);
  });
}

/* تلميح عند اللمس أو المرور */
function wireTips(box){
  let tip = document.getElementById("chartTip");
  if (!tip){
    tip = document.createElement("div");
    tip.id = "chartTip"; tip.className = "chart-tip"; tip.hidden = true;
    document.body.appendChild(tip);
  }
  const show = el => {
    const t = el.dataset.tip; if (!t) return;
    tip.textContent = t; tip.hidden = false;
    const r = el.getBoundingClientRect();
    tip.style.top  = (window.scrollY + r.top - tip.offsetHeight - 10) + "px";
    const x = r.left + r.width/2 - tip.offsetWidth/2;
    tip.style.left = Math.max(10, Math.min(window.innerWidth - tip.offsetWidth - 10, x)) + "px";
    clearTimeout(show._t); show._t = setTimeout(() => { tip.hidden = true; }, 2200);
  };
  box.querySelectorAll("[data-tip]").forEach(el => {
    el.onpointerenter = () => show(el);
    el.onclick = () => show(el);
  });
}
