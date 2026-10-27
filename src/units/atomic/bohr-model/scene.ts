/**
 * ボーア模型の描画（Canvas）。左に軌道（実際の縮尺: r ∝ n²）、右にエネルギー準位図、
 * 下にスペクトル（波長は対数目盛り）を描く。物理量の計算は model.ts に任せる。
 */
import type { Palette } from '@/core/theme';
import { formatFixed, formatSig } from '@/core/format';
import { niceStep } from '@/core/ticks';
import { wavelengthCss } from '@/core/spectrum';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawLabel,
  drawPhoton,
} from '@/ui/draw';
import {
  N_MAX,
  electronAt,
  energyLevelEV,
  lineWavelengthNm,
  orbitRadius,
  photonAt,
  seriesLimitNm,
  transition,
  type BohrParams,
  type BohrState,
} from './model';

const STRIP_H = 78;
const GAP = 10;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: BohrParams,
  s: BohrState,
): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const topH = size.height - STRIP_H - 2 * GAP;
  const splitX = Math.round(size.width * 0.5);
  const tr = transition(p);
  const photonColor = wavelengthCss(tr.wavelengthNm) ?? pal.muted;

  drawOrbits(ctx, size, pal, p, s, { right: splitX, bottom: topH }, photonColor);
  drawLevels(
    ctx,
    pal,
    p,
    s,
    { left: splitX + GAP, right: size.width - GAP, bottom: topH },
    photonColor,
  );
  drawSpectrum(ctx, pal, p, {
    x: GAP,
    y: size.height - STRIP_H - GAP,
    w: size.width - 2 * GAP,
    h: STRIP_H,
  });
}

/** 左: 原子核と円軌道（縮尺は実際どおり）、電子と光子 */
function drawOrbits(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: BohrParams,
  s: BohrState,
  area: { right: number; bottom: number },
  photonColor: string,
): void {
  const nOuter = Math.max(p.n, p.nf, 2);
  const R = orbitRadius(p.Z, nOuter) * 1.12;
  const vp = fitViewport(
    size,
    { xMin: -R, xMax: R, yMin: -R, yMax: R },
    {
      top: 26,
      left: GAP,
      right: size.width - area.right + GAP,
      bottom: size.height - area.bottom + 16,
    },
  );
  const cx = vp.x(0);
  const cy = vp.y(0);
  const e = electronAt(p, s.t);

  drawLabel(ctx, '軌道（実際の縮尺）', GAP + 2, 13, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // 円軌道 n = 1 〜 nOuter
  for (let k = 1; k <= nOuter; k++) {
    const r = vp.len(orbitRadius(p.Z, k));
    const current = k === e.n;
    ctx.save();
    ctx.strokeStyle = current ? pal.quantity.electron : pal.muted;
    ctx.globalAlpha = current ? 0.9 : 0.45;
    ctx.lineWidth = current ? 2 : 1;
    if (!current) ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const prev = k > 1 ? vp.len(orbitRadius(p.Z, k - 1)) : 0;
    if (r - prev > 12 && r > 16) {
      drawLabel(ctx, `${k}`, cx + r * 0.707 + 6, cy - r * 0.707 - 6, pal.muted, {
        font: CANVAS_FONT_SMALL,
      });
    }
  }

  // 原子核（+Ze）
  drawBall(ctx, cx, cy, 5, pal.quantity.nucleus, pal.bg);
  drawLabel(ctx, p.Z === 1 ? '+e' : `+${p.Z}e`, cx + 8, cy + 10, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // 光子（準位が移る位置を通る半直線上を進む）
  const ph = photonAt(p, s.t);
  if (ph) {
    const r0 = orbitRadius(p.Z, p.n);
    const edge = R * 1.05;
    const r = r0 + ph.progress * (edge - r0);
    const emit = transition(p).kind === '放出';
    const px = vp.x(r * Math.cos(ph.theta));
    const py = vp.y(r * Math.sin(ph.theta));
    const angle = -ph.theta + (emit ? 0 : Math.PI);
    drawPhoton(ctx, px, py, angle, 38, photonWavePx(transition(p).wavelengthNm), photonColor, 2.5);
    drawLabel(
      ctx,
      'hν',
      px + 16 * Math.cos(angle + Math.PI / 2),
      py + 16 * Math.sin(angle + Math.PI / 2),
      pal.fg,
      {
        font: CANVAS_FONT_MATH,
      },
    );
  }

  // 電子
  drawBall(
    ctx,
    vp.x(e.r * Math.cos(e.theta)),
    vp.y(e.r * Math.sin(e.theta)),
    5,
    pal.quantity.electron,
    pal.bg,
  );

  // 基準長（縮尺）
  const stepNm = niceStep(R * 1e9, 3);
  const len = vp.len(stepNm * 1e-9);
  const y = area.bottom - 4;
  const x0 = GAP + 4;
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y - 4);
  ctx.lineTo(x0, y);
  ctx.lineTo(x0 + len, y);
  ctx.lineTo(x0 + len, y - 4);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, `${formatSig(stepNm, 2)} nm`, x0 + len + 6, y - 2, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });
}

/** 波長 [nm] → 光子の波形の画面上の間隔 [px]（対数で 5〜24 px に対応させる模式） */
function photonWavePx(nm: number): number {
  const f = Math.log10(nm / 10) / Math.log10(20000 / 10);
  return 5 + 19 * Math.min(1, Math.max(0, f));
}

/** 右: エネルギー準位図（縦軸は eV の等間隔目盛り） */
function drawLevels(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  p: BohrParams,
  s: BohrState,
  area: { left: number; right: number; bottom: number },
  photonColor: string,
): void {
  const top = 34;
  const bottom = area.bottom - 8;
  const E1 = energyLevelEV(p.Z, 1);
  const y = (E: number) => top + (E / E1) * (bottom - top);
  const x0 = area.left + 34;
  const x1 = area.right - 46;
  const tr = transition(p);
  const nNow = electronAt(p, s.t).n;

  drawLabel(ctx, 'エネルギー準位 [eV]', area.left, 13, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // E = 0（電離）
  ctx.save();
  ctx.strokeStyle = pal.muted;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y(0));
  ctx.lineTo(x1, y(0));
  ctx.stroke();
  ctx.restore();
  const isActive = (k: number) => k === p.n || k === p.nf;
  const levelY = (k: number) => y(energyLevelEV(p.Z, k));
  for (let k = 1; k <= N_MAX; k++) {
    ctx.save();
    ctx.strokeStyle = isActive(k) ? pal.fg : pal.muted;
    ctx.lineWidth = isActive(k) ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x0, levelY(k));
    ctx.lineTo(x1, levelY(k));
    ctx.stroke();
    ctx.restore();
  }

  // 準位のラベル。上の方は間隔が狭いので重なるものは省く。n, n' は必ず書き、重なるときは上にずらす
  const LINE = 12;
  let lastY = Infinity;
  for (let k = 1; k <= N_MAX; k++) {
    const yy = levelY(k);
    let labelY: number;
    if (isActive(k)) {
      labelY = Math.min(yy, lastY - LINE);
    } else {
      const blocksActive = [p.n, p.nf].some((a) => a > k && yy - levelY(a) < LINE);
      if (lastY - yy < LINE || blocksActive) continue;
      labelY = yy;
    }
    const E = energyLevelEV(p.Z, k);
    const color = isActive(k) ? pal.fg : pal.muted;
    drawLabel(ctx, `n=${k}`, x0 - 6, labelY, color, { font: CANVAS_FONT_SMALL, align: 'right' });
    drawLabel(ctx, formatFixed(E, Math.abs(E) >= 10 ? 1 : 2), x1 + 6, labelY, color, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
    lastY = labelY;
  }
  if (lastY - y(0) >= LINE) {
    drawLabel(ctx, '∞', x0 - 6, y(0), pal.muted, { font: CANVAS_FONT_SMALL, align: 'right' });
    drawLabel(ctx, '0', x1 + 6, y(0), pal.muted, { font: CANVAS_FONT_SMALL, align: 'left' });
  }

  // 電子が今いる準位
  drawBall(ctx, x0 + 10, y(energyLevelEV(p.Z, nNow)), 4.5, pal.quantity.electron, pal.bg);

  // 遷移の矢印（光子の色）
  if (tr.kind !== 'なし') {
    const ax = x0 + (x1 - x0) * 0.42;
    drawArrow(ctx, ax, y(energyLevelEV(p.Z, p.n)), ax, y(energyLevelEV(p.Z, p.nf)), {
      color: photonColor,
      width: 3,
      head: 10,
    });
    const ya = y(energyLevelEV(p.Z, p.n));
    const yb = y(energyLevelEV(p.Z, p.nf));
    // 矢印が短いときは、準位の線と重ならないよう下の準位の下に書く
    const labelY = Math.abs(ya - yb) > 24 ? (ya + yb) / 2 : Math.max(ya, yb) + 14;
    drawLabel(ctx, `hν = ${formatFixed(tr.energyEV, 2)} eV`, ax + 8, labelY, pal.fg, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }
}

/** 下: スペクトル（n ≤ N_MAX の全遷移の線と、選んだ遷移の線） */
function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  p: BohrParams,
  r: { x: number; y: number; w: number; h: number },
): void {
  const lamMin = seriesLimitNm(p.Z, 1) * 0.8;
  const lamMax = lineWavelengthNm(p.Z, N_MAX, N_MAX - 1) * 1.25;
  const lx0 = r.x + 8;
  const lx1 = r.x + r.w - 8;
  const X = (nm: number) => lx0 + (Math.log(nm / lamMin) / Math.log(lamMax / lamMin)) * (lx1 - lx0);
  const top = r.y + 20;
  const bottom = r.y + r.h - 18;

  ctx.save();
  ctx.fillStyle = pal.spectrumBg;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();

  // 可視光の帯
  for (let x = Math.ceil(X(380)); x <= Math.floor(X(770)); x++) {
    if (x < lx0 || x > lx1) continue;
    const nm = lamMin * Math.exp(((x - lx0) / (lx1 - lx0)) * Math.log(lamMax / lamMin));
    const c = wavelengthCss(nm, 0.28);
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x, top, 1.2, bottom - top);
  }

  // すべての遷移の線（薄く）
  ctx.lineWidth = 1;
  for (let u = 2; u <= N_MAX; u++) {
    for (let l = 1; l < u; l++) {
      const nm = lineWavelengthNm(p.Z, u, l);
      ctx.strokeStyle = wavelengthCss(nm) ?? pal.spectrumFg;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(X(nm), top + (bottom - top) * 0.35);
      ctx.lineTo(X(nm), bottom);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 目盛り（10 のべき）
  for (let d = Math.ceil(Math.log10(lamMin)); d <= Math.floor(Math.log10(lamMax)); d++) {
    const nm = 10 ** d;
    const x = X(nm);
    ctx.strokeStyle = pal.spectrumFg;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 4);
    ctx.stroke();
    const label = nm >= 1000 ? `${nm / 1000} μm` : `${nm} nm`;
    drawLabel(ctx, label, x, bottom + 11, pal.spectrumFg, { font: CANVAS_FONT_SMALL });
  }
  drawLabel(ctx, 'スペクトル（波長は対数目盛り）', r.x + 8, r.y + 10, pal.spectrumFg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // 選んだ遷移の線
  const tr = transition(p);
  if (tr.kind !== 'なし') {
    const x = X(tr.wavelengthNm);
    ctx.strokeStyle = wavelengthCss(tr.wavelengthNm) ?? pal.spectrumFg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, top + 16);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    const text = `${formatSig(tr.wavelengthNm, 4)} nm`;
    const right = x > r.x + r.w - 40;
    drawLabel(ctx, text, x, top + 7, pal.spectrumFg, {
      font: CANVAS_FONT_SMALL,
      align: right ? 'right' : x < r.x + 40 ? 'left' : 'center',
    });
  }
  ctx.restore();
}
