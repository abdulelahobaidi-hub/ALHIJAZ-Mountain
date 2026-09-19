/* ============================================================
   نادي الجبال — بطاقة الإنجاز
   ترسم صورة بألوان التطبيق تُشارك أو تُحفظ
   ============================================================ */
import { L, LOC } from "./i18n.js";

const W = 1080, H = 1350;
const FONT = '"Readex Pro", system-ui, sans-serif';

async function ensureFont(){
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load(`700 220px ${FONT}`),
      document.fonts.load(`600 52px ${FONT}`),
      document.fonts.load(`400 40px ${FONT}`)
    ]);
    await document.fonts.ready;
  } catch(e){}
}

/* سلسلة جبال بنفس شكل بطاقة الرئيسية */
const RIDGE_TOP = 96, RIDGE_BOT = 200, RIDGE_H = 320;   // ارتفاع الجبال على البطاقة
function ridge(ctx, pts, fill, alpha){
  const X = x => x * (W / 360);
  const Y = y => (H - RIDGE_H) + (y - RIDGE_TOP) * (RIDGE_H / (RIDGE_BOT - RIDGE_TOP));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([x,y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx){
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#F28E5A");
  g.addColorStop(.55, "#E4645C");
  g.addColorStop(1, "#A82A4C");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* الشمس */
  const sx = W * .84, sy = H * .145;
  const glow = ctx.createRadialGradient(sx, sy, 14, sx, sy, 250);
  glow.addColorStop(0, "rgba(255,243,201,.6)");
  glow.addColorStop(1, "rgba(255,243,201,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sx, sy, 250, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(255,243,201,.9)";
  ctx.beginPath(); ctx.arc(sx, sy, 76, 0, Math.PI*2); ctx.fill();

  /* الجبال */
  ridge(ctx, [[0,200],[58,126],[96,152],[150,96],[196,142],[240,110],[300,160],[360,118],[360,200]],
        "#8A3F5C", .5);
  ridge(ctx, [[0,200],[48,158],[104,182],[168,140],[228,176],[288,148],[360,186],[360,200]],
        "#54244A", .78);
}

function text(ctx, s, x, y, size, weight = 400, alpha = 1, shadow = false){
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.direction = document.documentElement.dir === "ltr" ? "ltr" : "rtl";
  if (shadow){
    ctx.shadowColor = "rgba(60,20,45,.45)";
    ctx.shadowBlur = 36; ctx.shadowOffsetY = 10;
  }
  ctx.fillText(s, x, y);
  ctx.restore();
}

/* data = { title, eyebrow, big, unit, stats:[{v,l}], date } */
export async function drawCard(data){
  await ensureFont();
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  drawBackground(ctx);

  text(ctx, L("نادي الجبال"), W/2, 130, 46, 600, .9);
  if (data.eyebrow) text(ctx, data.eyebrow, W/2, 352, 48, 400, .9);

  const big = String(data.big);
  const size = big.length > 6 ? 150 : big.length > 4 ? 190 : 250;
  text(ctx, big, W/2, 588, size, 700, 1, true);
  if (data.unit) text(ctx, data.unit, W/2, 680, 52, 500, .94);

  const stats = (data.stats || []).filter(Boolean).slice(0, 3);
  if (stats.length){
    const gap = 26, cw = Math.min(300, (W - 140 - gap * (stats.length - 1)) / stats.length), ch = 170;
    const total = cw * stats.length + gap * (stats.length - 1);
    let x = (W - total) / 2, y = 812;
    stats.forEach(s => {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.18)";
      roundRect(ctx, x, y, cw, ch, 34); ctx.fill();
      ctx.restore();
      text(ctx, String(s.v), x + cw/2, y + 88, 62, 700, 1);
      text(ctx, s.l, x + cw/2, y + 138, 30, 400, .88);
      x += cw + gap;
    });
  }

  if (data.date) text(ctx, data.date, W/2, 1126, 38, 400, .82);
  text(ctx, "mountains-fit.online", W/2, 1268, 34, 500, .8);
  return c;
}

/* يعرض البطاقة في ورقة سفلية مع خياري المشاركة والحفظ */
export async function shareCard(data){
  const c = await drawCard(data);
  const url = c.toDataURL("image/png");
  const img = document.getElementById("shImg");
  const box = document.getElementById("shareSheet");
  if (!img || !box) return;
  img.src = url;
  box.hidden = false;

  const blobOf = () => new Promise(res => c.toBlob(res, "image/png"));

  document.getElementById("shGo").onclick = async () => {
    const blob = await blobOf();
    if (!blob) return;
    const file = new File([blob], "mountains-fit.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })){
        await navigator.share({ files: [file], title: L("نادي الجبال") });
        return;
      }
    } catch(e){ return; }                       // المستخدم ألغى المشاركة
    saveBlob(blob);
  };
  document.getElementById("shSave").onclick = async () => {
    const blob = await blobOf();
    if (blob) saveBlob(blob);
  };
}

function saveBlob(blob){
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = "mountains-fit.png";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
