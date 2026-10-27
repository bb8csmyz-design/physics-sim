/**
 * 交流回路（RLC 直列）の描画（Canvas）。左に回路図と各素子の瞬時電圧、右にベクトル図（回転する
 * フェーザー）。物理量の計算は model.ts に任せ、ここでは描くだけ。回路図は縮尺のない模式図。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT,
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawCircuitElement,
  drawDashedLine,
  drawFlowDots,
  drawLabel,
  drawWire,
} from '@/ui/draw';
import {
  TIME_SCALE,
  angularFrequency,
  capacitiveReactance,
  elementVoltages,
  inductiveReactance,
  peakCurrent,
  peakVoltage,
  phaseLag,
  type AcParams,
  type AcState,
} from './model';

export interface SceneOptions {
  showCurrent: boolean;
  showPhasor: boolean;
}

/** ベクトル図の中心と半径（模式図の単位）。横長の画面では回路図の右、縦長（スマホ）では下に置く */
const PHASOR_WIDE = { x: 15.2, y: 3.1, r: 3.4 };
const PHASOR_NARROW = { x: 4.5, y: -4.9, r: 3.6 };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: AcParams,
  s: AcState,
  t: number,
  opt: SceneOptions,
): void {
  const narrow = size.width / size.height < 1.5;
  const vp = fitViewport(
    size,
    narrow
      ? { xMin: -3.6, xMax: 11.6, yMin: -9.2, yMax: 7.6 }
      : { xMin: -2.6, xMax: 19.4, yMin: -1.2, yMax: 7.6 },
    10,
  );
  const pt = (x: number, y: number) => ({ x: vp.x(x), y: vp.y(y) });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const wire = pal.fg;
  const v = elementVoltages(p, s, t);

  // 回路図: 交流電源（左）→ 抵抗 → コイル（上）→ コンデンサー（右）
  drawCircuitElement(ctx, 'ac-source', vp.x(0), vp.y(0), vp.x(0), vp.y(6), {
    color: wire,
    fill: pal.bg,
  });
  drawCircuitElement(ctx, 'resistor', vp.x(0), vp.y(6), vp.x(4.5), vp.y(6), {
    color: wire,
    fill: pal.bg,
  });
  drawCircuitElement(ctx, 'coil', vp.x(4.5), vp.y(6), vp.x(9), vp.y(6), { color: wire, size: 56 });
  drawCircuitElement(ctx, 'capacitor', vp.x(9), vp.y(6), vp.x(9), vp.y(0), {
    color: wire,
    size: 14,
  });
  drawWire(ctx, [pt(9, 0), pt(0, 0)], wire);

  const small = { font: CANVAS_FONT_SMALL };
  drawLabel(ctx, 'R', vp.x(2.25), vp.y(6) - 22, wire, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, 'L', vp.x(6.75), vp.y(6) - 22, wire, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, 'C', vp.x(9) + 22, vp.y(3) - 12, wire, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, `${formatFixed(v.R, 1)} V`, vp.x(2.25), vp.y(6) + 22, pal.quantity.heat, small);
  drawLabel(
    ctx,
    `${formatFixed(v.L, 1)} V`,
    vp.x(6.75),
    vp.y(6) + 22,
    pal.quantity.magnetic,
    small,
  );
  drawLabel(ctx, `${formatFixed(v.C, 1)} V`, vp.x(9) + 14, vp.y(3) + 12, pal.quantity.electric, {
    ...small,
    align: 'left',
  });
  drawLabel(ctx, 'v', vp.x(0) - 26, vp.y(3) - 12, pal.quantity.potential, {
    font: CANVAS_FONT_MATH,
  });
  drawLabel(
    ctx,
    `${formatFixed(v.source, 1)} V`,
    vp.x(0) - 22,
    vp.y(3) + 10,
    pal.quantity.potential,
    { ...small, align: 'right' },
  );
  drawLabel(ctx, `i = ${formatFixed(s.i, 2)} A`, vp.x(4.5), vp.y(1.2), pal.quantity.current, small);

  // 電流の流れ（点の移動量 ∝ コンデンサーの電気量 = 流れた電気量。最大電流で実時間毎秒 60 px）
  const I0 = peakCurrent(p);
  if (opt.showCurrent && I0 > 0) {
    const loop = [pt(0, 0), pt(0, 6), pt(9, 6), pt(9, 0), pt(0, 0)];
    drawFlowDots(ctx, loop, (s.q / (I0 * TIME_SCALE)) * 60, {
      color: pal.quantity.current,
      radius: 3.5,
    });
  }

  if (opt.showPhasor) drawPhasors(ctx, vp, pal, p, t, narrow ? PHASOR_NARROW : PHASOR_WIDE);
}

/**
 * ベクトル図。各量を角速度 ω で反時計回りに回る矢印で表し、縦軸への射影が瞬時値になる。
 * 電圧は V_R（電流と同じ向き）→ V_L（90° 進み）→ V_C（90° 遅れ）とつなぐと、和が電源電圧 V になる。
 * 電流 I は別の縮尺（共振のときの最大値 V₀/R を半径の 0.9 倍）で描く。
 */
function drawPhasors(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pal: Palette,
  p: AcParams,
  t: number,
  center: { x: number; y: number; r: number },
): void {
  const cx = vp.x(center.x);
  const cy = vp.y(center.y);
  const r = vp.len(center.r);
  const I0 = peakCurrent(p);
  const VR = p.R * I0;
  const VL = inductiveReactance(p) * I0;
  const VC = capacitiveReactance(p) * I0;
  const V0 = peakVoltage(p);
  const scale = r / Math.max(V0, Math.hypot(VR, VL), Math.hypot(VR, VC));
  const thV = angularFrequency(p) * t;
  const thI = thV - phaseLag(p);
  /** 角度 th、長さ len [px] のベクトルの終点（画面座標は y 下向き） */
  const tip = (x: number, y: number, th: number, len: number) => ({
    x: x + len * Math.cos(th),
    y: y - len * Math.sin(th),
  });

  // 軸
  ctx.save();
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r - 6, cy);
  ctx.lineTo(cx + r + 6, cy);
  ctx.moveTo(cx, cy + r + 6);
  ctx.lineTo(cx, cy - r - 6);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, 'ベクトル図（反時計回りに回転）', cx, cy - r - 18, pal.muted, {
    font: CANVAS_FONT_SMALL,
  });

  // 電流 I（電圧の矢印の下に描く。V_R と同じ向きなので重なる）
  const iLen = 0.9 * r * ((I0 * p.R) / V0);
  const iTip = tip(cx, cy, thI, iLen);
  drawArrow(ctx, cx, cy, iTip.x, iTip.y, { color: pal.quantity.current, width: 3, head: 11 });
  drawLabel(
    ctx,
    'I',
    iTip.x + 12 * Math.cos(thI),
    iTip.y - 12 * Math.sin(thI),
    pal.quantity.current,
    {
      font: CANVAS_FONT,
    },
  );

  // 電圧の和: V_R → V_L → V_C
  const a = tip(cx, cy, thI, VR * scale);
  const b = tip(a.x, a.y, thI + Math.PI / 2, VL * scale);
  const c = tip(b.x, b.y, thI - Math.PI / 2, VC * scale);
  drawArrow(ctx, cx, cy, a.x, a.y, { color: pal.quantity.heat, width: 2, head: 8 });
  drawArrow(ctx, a.x, a.y, b.x, b.y, { color: pal.quantity.magnetic, width: 2, head: 8 });
  drawArrow(ctx, b.x, b.y, c.x, c.y, { color: pal.quantity.electric, width: 2, head: 8 });
  const lab = (
    text: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
  ) => {
    if (Math.hypot(to.x - from.x, to.y - from.y) < 16) return;
    drawLabel(ctx, text, (from.x + to.x) / 2 + 9, (from.y + to.y) / 2 - 9, color, {
      font: CANVAS_FONT_MATH,
    });
  };
  lab('R', { x: cx, y: cy }, a, pal.quantity.heat);
  lab('L', a, b, pal.quantity.magnetic);
  lab('C', b, c, pal.quantity.electric);

  // 電源電圧 V
  const vTip = tip(cx, cy, thV, V0 * scale);
  drawArrow(ctx, cx, cy, vTip.x, vTip.y, { color: pal.quantity.potential, width: 3, head: 11 });
  drawLabel(
    ctx,
    'V',
    vTip.x + 12 * Math.cos(thV),
    vTip.y - 12 * Math.sin(thV),
    pal.quantity.potential,
    {
      font: CANVAS_FONT,
    },
  );
  // 瞬時値 = 縦軸への射影
  drawDashedLine(ctx, vTip.x, vTip.y, cx, vTip.y, pal.quantity.potential);
  drawDashedLine(ctx, iTip.x, iTip.y, cx, iTip.y, pal.quantity.current);

  // 位相差 φ の弧
  const phi = phaseLag(p);
  if (Math.abs(phi) > 0.05) {
    ctx.save();
    ctx.strokeStyle = pal.fg;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // canvas の角度は時計回りなので符号を反転する
    ctx.arc(cx, cy, r * 0.28, -thV, -thI, phi < 0);
    ctx.stroke();
    ctx.restore();
    const mid = (thV + thI) / 2;
    drawLabel(ctx, 'φ', cx + r * 0.4 * Math.cos(mid), cy - r * 0.4 * Math.sin(mid), pal.fg, {
      font: CANVAS_FONT_MATH,
    });
  }
}
