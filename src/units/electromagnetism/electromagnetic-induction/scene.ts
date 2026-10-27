/**
 * レール上の導体棒（電磁誘導）の描画（Canvas）。真上から見た図。
 * 物理量の計算は model.ts に任せ、ここでは描くだけ。棒が画面の右へ進むと視点が追いかける。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawCircuitElement,
  drawFlowDots,
  drawLabel,
  drawOutOfPlaneMark,
} from '@/ui/draw';
import {
  chargePassed,
  current,
  magneticForce,
  terminalVelocity,
  type InductionParams,
  type InductionState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showCurrent: boolean;
}

/** 画面に映す範囲の高さ [m]（レールの間隔の最大値 1 m に余白を足す。縮尺は一定） */
const VIEW_H = 1.7;
const ROD_OVERHANG = 0.08;
const PAD = { top: 10, right: 10, bottom: 28, left: 10 };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: InductionParams,
  s: InductionState,
  opt: SceneOptions,
): void {
  const aspect = (size.width - PAD.left - PAD.right) / (size.height - PAD.top - PAD.bottom);
  const W = VIEW_H * aspect;
  // 棒が右端から 30% の位置を越えたら視点を右へずらす
  const xMin = Math.max(-0.25, s.x - 0.7 * W);
  const world = { xMin, xMax: xMin + W, yMin: -VIEW_H / 2, yMax: VIEW_H / 2 };
  const vp = fitViewport(size, world, PAD);
  const half = p.l / 2;

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 回路を貫く磁束の範囲（抵抗から棒まで）
  ctx.save();
  ctx.fillStyle = pal.quantity.magnetic;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(vp.x(0), vp.y(half), vp.len(s.x), vp.len(p.l));
  ctx.restore();

  // 磁場 ⊙（どこでも一様）
  const spacing = 0.25;
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = Math.floor(world.xMin / spacing); i * spacing < world.xMax + spacing; i++) {
    for (let j = -4; j < 4; j++) {
      drawOutOfPlaneMark(
        ctx,
        vp.x((i + 0.5) * spacing),
        vp.y((j + 0.5) * spacing),
        6,
        'out',
        pal.quantity.magnetic,
      );
    }
  }
  ctx.restore();

  // レール
  const railR = vp.x(world.xMax + 1);
  ctx.save();
  ctx.strokeStyle = pal.fixture;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const y of [half, -half]) {
    ctx.beginPath();
    ctx.moveTo(vp.x(0), vp.y(y));
    ctx.lineTo(railR, vp.y(y));
    ctx.stroke();
  }
  ctx.restore();

  // レールの目盛り（抵抗からの距離）
  const tickStep = 0.5;
  for (let k = Math.max(0, Math.ceil(world.xMin / tickStep)); k * tickStep <= world.xMax; k++) {
    const x = vp.x(k * tickStep);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.beginPath();
    ctx.moveTo(x, vp.y(-half) + 4);
    ctx.lineTo(x, vp.y(-half) + 10);
    ctx.stroke();
    ctx.restore();
    drawLabel(ctx, formatFixed(k * tickStep, 1), x, vp.y(-half) + 20, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }
  drawLabel(ctx, 'x [m]', size.width - PAD.right - 4, vp.y(-half) + 20, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 抵抗（左端）
  drawCircuitElement(ctx, 'resistor', vp.x(0), vp.y(-half), vp.x(0), vp.y(half), {
    color: pal.fg,
    fill: pal.bg,
  });
  drawLabel(ctx, 'R', vp.x(0) + 22, vp.y(0), pal.fg, { font: CANVAS_FONT_MATH });

  // 誘導電流（時計回りが正）: 棒の上端 → 下端 → 下のレール → 抵抗 → 上のレール
  const I = current(p, s.v);
  if (opt.showCurrent) {
    const loop = [
      { x: vp.x(s.x), y: vp.y(half) },
      { x: vp.x(s.x), y: vp.y(-half) },
      { x: vp.x(0), y: vp.y(-half) },
      { x: vp.x(0), y: vp.y(half) },
      { x: vp.x(s.x), y: vp.y(half) },
    ];
    // 終端速度での電流が 1 秒あたり約 60 px 進む速さで点を流す
    const iRef = Math.max(
      Math.abs(current(p, terminalVelocity(p))),
      Math.abs(current(p, p.v0)),
      1e-3,
    );
    drawFlowDots(ctx, loop, (chargePassed(p, s) / iRef) * 60, {
      color: pal.quantity.current,
      radius: 3.5,
    });
    if (Math.abs(I) > 1e-4) {
      const yMid = vp.y(0);
      drawLabel(ctx, `I ${I > 0 ? '↓' : '↑'}`, vp.x(s.x) - 22, yMid, pal.quantity.current, {
        font: CANVAS_FONT_MATH,
      });
    }
  }

  // 導体棒
  const rodX = vp.x(s.x);
  ctx.save();
  ctx.fillStyle = pal.body;
  ctx.strokeStyle = pal.bodyStroke;
  ctx.lineWidth = 1.5;
  const rodW = Math.max(8, vp.len(0.035));
  ctx.beginPath();
  ctx.roundRect(
    rodX - rodW / 2,
    vp.y(half + ROD_OVERHANG),
    rodW,
    vp.len(p.l + 2 * ROD_OVERHANG),
    3,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 矢印（長さはパラメータから決めた基準値で規格化）
  const arrowMax = 0.45; // [m]
  const vRef = Math.max(terminalVelocity(p), p.v0, 0.1);
  const fRef = Math.max(p.F, Math.abs(magneticForce(p, p.v0)), 0.01);
  const topY = vp.y(half + ROD_OVERHANG) - 14;
  if (opt.showVelocity && s.v !== 0) {
    const len = vp.len((arrowMax * s.v) / vRef);
    drawArrow(ctx, rodX, topY, rodX + len, topY, { color: pal.quantity.velocity });
    if (Math.abs(len) > 14)
      drawLabel(ctx, 'v', rodX + len + Math.sign(len) * 10, topY, pal.quantity.velocity, {
        font: CANVAS_FONT_MATH,
      });
  }
  if (opt.showForce) {
    const fy = vp.y(half * 0.45);
    if (p.F > 0) {
      const len = vp.len((arrowMax * p.F) / fRef);
      drawArrow(ctx, rodX + rodW / 2, fy, rodX + rodW / 2 + len, fy, { color: pal.quantity.force });
      if (len > 14)
        drawLabel(ctx, 'F', rodX + rodW / 2 + len + 10, fy, pal.quantity.force, {
          font: CANVAS_FONT_MATH,
        });
    }
    const fm = magneticForce(p, s.v);
    const fy2 = vp.y(-half * 0.45);
    if (fm !== 0) {
      const len = vp.len((arrowMax * fm) / fRef);
      const x0 = rodX + Math.sign(fm) * (rodW / 2);
      drawArrow(ctx, x0, fy2, x0 + len, fy2, { color: pal.quantity.force, dashed: true });
      if (Math.abs(len) > 20)
        drawLabel(ctx, 'IBl', x0 + len + Math.sign(len) * 18, fy2, pal.quantity.force, {
          font: CANVAS_FONT_MATH,
        });
    }
  }

  drawLabel(
    ctx,
    '磁場 ⊙ 鉛直上向き（真上から見た図）',
    PAD.left + 6,
    PAD.top + 10,
    pal.quantity.magnetic,
    {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    },
  );
}
