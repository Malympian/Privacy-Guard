const ICON_SIZES = [16, 32, 48, 128];
const imageDataCache = new Map();

function drawLockIcon(ctx, size) {
  const s = size;
  const cx = s / 2;

  const bg = ctx.createRadialGradient(cx, cx * 0.9, s * 0.05, cx, cx, s * 0.7);
  bg.addColorStop(0, "#1e2d45");
  bg.addColorStop(1, "#0d1520");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, s, s, s * 0.18);
  ctx.fill();

  const bodyW = s * 0.62;
  const bodyH = s * 0.42;
  const bodyX = (s - bodyW) / 2;
  const bodyY = s * 0.48;
  const bodyR = s * 0.09;

  const shackleOuter = s * 0.22;
  const shackleInner = s * 0.13;
  const shackleCx = cx;
  const shackleCy = bodyY + s * 0.03;
  const shackleTop = bodyY - s * 0.24;

  ctx.save();
  ctx.shadowColor = "#f5c542";
  ctx.shadowBlur = s * 0.12;

  const shackleGrad = ctx.createLinearGradient(
    cx - shackleOuter,
    shackleTop,
    cx + shackleOuter,
    shackleCy,
  );
  shackleGrad.addColorStop(0, "#ffe066");
  shackleGrad.addColorStop(0.5, "#f5c000");
  shackleGrad.addColorStop(1, "#c8860a");

  ctx.beginPath();
  ctx.arc(shackleCx, shackleCy, shackleOuter, Math.PI, 0, false);
  ctx.lineWidth = (shackleOuter - shackleInner) * 2;
  ctx.strokeStyle = shackleGrad;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = s * 0.08;
  ctx.shadowOffsetY = s * 0.03;

  const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
  bodyGrad.addColorStop(0, "#ffe066");
  bodyGrad.addColorStop(0.38, "#f5c000");
  bodyGrad.addColorStop(1, "#a86a00");

  ctx.fillStyle = bodyGrad;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, bodyR);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#fff";
  roundRect(
    ctx,
    bodyX + s * 0.04,
    bodyY + s * 0.025,
    bodyW - s * 0.08,
    bodyH * 0.35,
    bodyR * 0.6,
  );
  ctx.fill();
  ctx.restore();

  const khCx = cx;
  const khCy = bodyY + bodyH * 0.42;
  const khR = s * 0.085;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = s * 0.04;
  ctx.fillStyle = "#1e2d45";

  ctx.beginPath();
  ctx.arc(khCx, khCy, khR, 0, Math.PI * 2);
  ctx.fill();

  const stemW = khR * 0.75;
  const stemH = khR * 1.1;
  ctx.fillRect(khCx - stemW / 2, khCy, stemW, stemH);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBlockCount(ctx, size, count) {
  const n = Math.min(999, Math.max(0, count | 0));
  if (n === 0) return;

  const label = n > 99 ? "99+" : String(n);

  const r = Math.max(6, Math.round(size * 0.36));
  const cx = size - r + size * 0.04;
  const cy = size - r + size * 0.04;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.08;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fill();

  const badgeGrad = ctx.createRadialGradient(
    cx - r * 0.2,
    cy - r * 0.25,
    0,
    cx,
    cy,
    r,
  );
  badgeGrad.addColorStop(0, "#ff6a3d");
  badgeGrad.addColorStop(1, "#c0280a");
  ctx.fillStyle = badgeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1.2, size / 20);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const fontSize =
    label.length > 2
      ? Math.max(7, Math.round(r * 0.88))
      : Math.max(9, Math.round(r * 1.18));

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 0.5);
}

async function buildActionIconImageData(_status, blockCount) {
  const cacheKey = `lock-${blockCount | 0}`;
  if (imageDataCache.has(cacheKey)) return imageDataCache.get(cacheKey);

  const imageData = {};
  for (const size of ICON_SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    drawLockIcon(ctx, size);
    if (blockCount > 0) drawBlockCount(ctx, size, blockCount);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }

  imageDataCache.set(cacheKey, imageData);

  if (imageDataCache.size > 60) {
    imageDataCache.delete(imageDataCache.keys().next().value);
  }
  return imageData;
}

async function preloadStatusBitmaps() {}
