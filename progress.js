/* ============================================================
   نادي جبال الحجاز — لوحة التقدّم والشارات
   كل شي هنا يُحسب من سجل تمارينك المحلي — بدون أي قراءة إضافية
   ============================================================ */

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

  const defs = [
    { id:"first",  icon:"🌄", name:"أول خطوة",      desc:"أول تمرين مكتمل",        now:Math.min(done.length,1), goal:1 },
    { id:"w10",    icon:"💪", name:"عشرة",           desc:"١٠ تمارين",              now:done.length, goal:10 },
    { id:"w50",    icon:"🎯", name:"خمسين",          desc:"٥٠ تمريناً",             now:done.length, goal:50 },
    { id:"w100",   icon:"🏅", name:"مئة",            desc:"١٠٠ تمرين",              now:done.length, goal:100 },
    { id:"s7",     icon:"🔥", name:"أسبوع متواصل",   desc:"٧ أيام متتالية",         now:st.best, goal:7 },
    { id:"s14",    icon:"⛰️", name:"أسبوعان",        desc:"١٤ يوماً متتالياً",      now:st.best, goal:14 },
    { id:"s30",    icon:"🏔️", name:"شهر كامل",       desc:"٣٠ يوماً متتالياً",      now:st.best, goal:30 },
    { id:"s100",   icon:"👑", name:"قمة الحجاز",     desc:"١٠٠ يوم متتالٍ",         now:st.best, goal:100 },
    { id:"m500",   icon:"⏱️", name:"٥٠٠ دقيقة",      desc:"٥٠٠ دقيقة تدريب",        now:mins, goal:500 },
    { id:"m2000",  icon:"🕰️", name:"٢٠٠٠ دقيقة",     desc:"٢٠٠٠ دقيقة تدريب",       now:mins, goal:2000 },
    { id:"week7",  icon:"📅", name:"أسبوع بلا راحة", desc:"٧ أيام تدريب في أسبوع",  now:fullWeek?1:0, goal:1 },
    { id:"dawn",   icon:"🌅", name:"قبل الفجر",      desc:"تمرين قبل ٧ صباحاً",     now:dawn?1:0, goal:1 },
    { id:"owl",    icon:"🦉", name:"بومة الليل",     desc:"تمرين بعد ١١ مساءً",     now:owl?1:0, goal:1 }
  ];
  return defs.map(b => ({ ...b, done: b.now >= b.goal, pct: Math.min(100, Math.round(b.now / b.goal * 100)) }));
}

export const badgeCount = () => badgeList().filter(b => b.done).length;

function badgesHTML(){
  const list = badgeList();
  const got = list.filter(b => b.done).length;
  return `
    <div class="head-row"><h2>الشارات</h2><span class="count">${got} من ${list.length}</span></div>
    <div class="badges">` + list.map(b => `
      <div class="badge${b.done ? " on" : ""}" title="${esc(b.desc)}">
        <span class="bg-ic">${b.icon}</span>
        <b>${esc(b.name)}</b>
        <span>${b.done ? esc(b.desc) : `${b.now} من ${b.goal}`}</span>
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
  const fmt = d => d.toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { day:"numeric", month:"numeric" });

  return `
    <div class="card chart">
      <div class="chart-head">
        <h3>تمارينك في ١٢ أسبوعاً</h3>
        <span>${last.count} هذا الأسبوع</span>
      </div>
      <div class="cols" role="img" aria-label="عدد التمارين لكل أسبوع خلال آخر ١٢ أسبوعاً">
        ${weeks.map((w,i) => `
          <div class="col${i === weeks.length-1 ? " now" : ""}" data-tip="${fmt(w.from)} · ${w.count} تمرين · ${w.mins} دقيقة">
            ${(i === bestIdx || i === weeks.length-1) && w.count ? `<u>${w.count}</u>` : ""}
            <i style="height:${Math.round(w.count / max * 100)}%"></i>
          </div>`).join("")}
      </div>
      <div class="chart-foot"><span>قبل ١٢ أسبوعاً</span><span>هذا الأسبوع</span></div>
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
      const label = day.toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { weekday:"short", day:"numeric", month:"short" });
      cells += `<span class="hc l${lvl}" style="grid-column:${weeks-w};grid-row:${d+1}"
        data-tip="${label} · ${frozen.has(k) ? "يوم راحة محمي" : n ? n + " تمرين" : "بدون تمرين"}"></span>`;
    }
  }
  return `
    <div class="card chart">
      <div class="chart-head"><h3>آخر ١٦ أسبوعاً</h3><span>${days.size} يوم تدريب</span></div>
      <div class="heat" role="img" aria-label="خريطة أيام التدريب في آخر ١٦ أسبوعاً">${cells}</div>
      <div class="heat-key">
        <span>أقل</span>
        <i class="hc l0"></i><i class="hc l2"></i><i class="hc l3"></i><i class="hc l4"></i>
        <span>أكثر</span>
        <i class="hc lz"></i><span>يوم محمي</span>
      </div>
    </div>`;
}

function plansHTML(){
  const done = C.S.sessions.filter(s => s.completed !== false);
  if (!done.length) return "";
  const by = {};
  done.forEach(s => { const k = s.planName || "تمرين"; by[k] = (by[k]||0) + 1; });
  const rows = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,4);
  const max = rows[0][1];
  return `
    <div class="card chart">
      <div class="chart-head"><h3>أكثر جداولك استخداماً</h3></div>
      <div class="hbars">` + rows.map(([n,c]) => `
        <div class="hbar">
          <span class="hb-name">${esc(n)}</span>
          <span class="hb-track"><i style="width:${Math.round(c/max*100)}%"></i></span>
          <b>${c}</b>
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
        <strong>${month.length}</strong><small>هذا الشهر</small></div>
      <div class="stat"><span class="stat-ic s-gold"><svg class="ic"><use href="#i-timer"/></svg></span>
        <strong>${Math.round(month.reduce((a,s)=>a+(s.secs||0),0)/60)}</strong><small>دقيقة هذا الشهر</small></div>
      <div class="stat"><span class="stat-ic s-plum"><svg class="ic"><use href="#i-trophy"/></svg></span>
        <strong>${avg}</strong><small>معدل الأسبوع</small></div>
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
    box.innerHTML = `<p class="empty">خلّص أول تمرين ويبدأ التحليل يبني نفسه.</p>` + badgesHTML();
  } else {
    box.innerHTML = kpisHTML() + columnsHTML() + heatHTML() + plansHTML() + badgesHTML();
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
