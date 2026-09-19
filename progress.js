/* ============================================================
   نادي جبال الحجاز — لوحة التقدّم والشارات
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
    { id:"s100",   icon:"👑", name:L("قمة الحجاز"),     desc:L("١٠٠ يوم متتالٍ"),         now:st.best, goal:100 },
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
function weekBuckets(n = 12){
  const done = C.S.sessions.filter(s => s.completed !== false);
  const out = [];
  const w0 = startOfWeek(Date.now());
  for (let i = n - 1; i >= 0; i--){
    const from = new Date(w0.getTime() - i * 7 * DAY);
    const to   = new Date(from.getTime() + 7 * DAY);
    const rows = done.filter(s => s.at >= from.getTime() && s.at < to.getTime());
    out.push({
      from, count: rows.length,
      mins: Math.round(rows.reduce((a,s) => a + (s.secs||0), 0) / 60)
    });
  }
  return out;
}

function columnsHTML(){
  const weeks = weekBuckets(12);
  const max = Math.max(1, ...weeks.map(w => w.count));
  const last = weeks[weeks.length-1];
  const bestIdx = weeks.reduce((bi, w, i) => w.count > weeks[bi].count ? i : bi, 0);
  const fmt = d => d.toLocaleDateString(LOC(), { day:"numeric", month:"numeric" });

  return `
    <div class="card chart">
      <div class="chart-head">
        <h3>${L("تمارينك في ١٢ أسبوعاً")}</h3>
        <span>${last.count} ${L("هذا الأسبوع")}</span>
      </div>
      <div class="cols" role="img" aria-label="${L("عدد التمارين لكل أسبوع خلال آخر ١٢ أسبوعاً")}">
        ${weeks.map((w,i) => `
          <div class="col${i === weeks.length-1 ? " now" : ""}" data-tip="${fmt(w.from)} · ${w.count} ${L("تمرين")} · ${w.mins} ${L("دقيقة")}">
            ${(i === bestIdx || i === weeks.length-1) && w.count ? `<u>${w.count}</u>` : ""}
            <i style="height:${Math.round(w.count / max * 100)}%"></i>
          </div>`).join("")}
      </div>
      <div class="chart-foot"><span>${L("قبل ١٢ أسبوعاً")}</span><span>${L("هذا الأسبوع")}</span></div>
    </div>`;
}

function heatHTML(){
  const days = new Set(C.S.sessions.filter(s => s.completed !== false).map(s => C.dayKey(s.at)));
  const frozen = new Set(Object.keys((C.S.freeze && C.S.freeze.used) || {}));
  const counts = {};
  C.S.sessions.filter(s => s.completed !== false)
    .forEach(s => { const k = C.dayKey(s.at); counts[k] = (counts[k]||0) + 1; });

  const weeks = 16;
  const end = startOfWeek(Date.now());
  let cells = "";
  for (let w = weeks - 1; w >= 0; w--){
    const ws = new Date(end.getTime() - w * 7 * DAY);
    for (let d = 0; d < 7; d++){
      const day = new Date(ws.getTime() + d * DAY);
      const k = C.dayKey(day);
      const future = day.getTime() > Date.now();
      const n = counts[k] || 0;
      const lvl = future ? "f" : frozen.has(k) ? "z" : n >= 3 ? 4 : n === 2 ? 3 : n === 1 ? 2 : 0;
      const label = day.toLocaleDateString(LOC(), { weekday:"short", day:"numeric", month:"short" });
      cells += `<span class="hc l${lvl}" style="grid-column:${weeks-w};grid-row:${d+1}"
        data-tip="${label} · ${frozen.has(k) ? L("يوم راحة محمي") : n ? n + L(" تمرين") : L("بدون تمرين")}"></span>`;
    }
  }
  return `
    <div class="card chart">
      <div class="chart-head"><h3>${L("آخر ١٦ أسبوعاً")}</h3><span>${days.size} ${L("يوم تدريب")}</span></div>
      <div class="heat" role="img" aria-label="${L("خريطة أيام التدريب في آخر ١٦ أسبوعاً")}">${cells}</div>
      <div class="heat-key">
        <span>${L("أقل")}</span>
        <i class="hc l0"></i><i class="hc l2"></i><i class="hc l3"></i><i class="hc l4"></i>
        <span>${L("أكثر")}</span>
        <i class="hc lz"></i><span>${L("يوم محمي")}</span>
      </div>
    </div>`;
}

function plansHTML(){
  const done = C.S.sessions.filter(s => s.completed !== false);
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
function liftRows(){
  const map = new Map();
  C.S.sessions.filter(s => s.completed !== false && s.lifts && s.lifts.length)
    .slice().sort((a,b) => a.at - b.at)               // من الأقدم للأحدث
    .forEach(s => s.lifts.forEach(l => {
      const cur = map.get(l.name) || { name:l.name, best:0, first:0, last:0, vol:0, times:0 };
      const w = +l.weight || 0;
      if (!cur.times) cur.first = w;
      cur.best = Math.max(cur.best, w); cur.last = w; cur.times++;
      cur.vol += (+l.sets||0) * (+l.reps||0) * w;
      map.set(l.name, cur);
    }));
  return [...map.values()].sort((a,b) => b.vol - a.vol);
}
export const totalVolume = () =>
  Math.round(C.S.sessions.filter(s => s.completed !== false).reduce((a,s) => a + (+s.volume||0), 0));

function liftsHTML(){
  const rows = liftRows();
  if (!rows.length) return "";
  const max = Math.max(...rows.map(r => r.best), 1);
  return `
    <div class="card chart">
      <div class="chart-head"><h3>${L("أوزانك")}</h3><span>${totalVolume().toLocaleString("en-US")} ${L("كجم إجمالاً")}</span></div>
      <div class="lifts">` + rows.slice(0,6).map(r => `
        <div class="lift-item" data-tip="${esc(L(r.name))} · ${L("أفضل")} ${r.best} ${L("كجم")} · ${r.times} ${L("مجموعة")} · ${Math.round(r.vol).toLocaleString("en-US")} ${L("كجم حجم")}">
          <span class="li-name">${esc(L(r.name))}</span>
          <span class="li-track"><i style="width:${Math.round(r.best / max * 100)}%"></i></span>
          <b>${r.best}<small>${L("كجم")}</small></b>
          ${r.last > r.first ? `<span class="lift-up">+${Math.round((r.last - r.first) * 10) / 10}</span>` : ""}
        </div>`).join("") + `</div>
    </div>`;
}

function kpisHTML(){
  const done = C.S.sessions.filter(s => s.completed !== false);
  const m0 = new Date(); m0.setDate(1); m0.setHours(0,0,0,0);
  const month = done.filter(s => s.at >= m0.getTime());
  const weeks = weekBuckets(4);
  const avg = (weeks.reduce((a,w) => a + w.count, 0) / 4).toFixed(1).replace(/\.0$/,"");
  return `
    <div class="stats">
      <div class="stat"><span class="stat-ic s-rose"><svg class="ic"><use href="#i-check"/></svg></span>
        <strong>${month.length}</strong><small>${L("هذا الشهر")}</small></div>
      <div class="stat"><span class="stat-ic s-gold"><svg class="ic"><use href="#i-timer"/></svg></span>
        <strong>${Math.round(month.reduce((a,s)=>a+(s.secs||0),0)/60)}</strong><small>${L("دقيقة هذا الشهر")}</small></div>
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
  const done = C.S.sessions.filter(s => s.completed !== false);
  if (!done.length){
    box.innerHTML = `<p class="empty">${L("خلّص أول تمرين ويبدأ التحليل يبني نفسه.")}</p>` + badgesHTML();
  } else {
    box.innerHTML = kpisHTML() + columnsHTML() + heatHTML() + liftsHTML() + plansHTML() + badgesHTML();
  }
  wireTips(box);
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
