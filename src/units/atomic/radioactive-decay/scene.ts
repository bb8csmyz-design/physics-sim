/**
 * 放射性崩壊の描画（Canvas）。N₀ 個の原子核を格子状に並べ、崩壊していない核（親核）と
 * 崩壊した核（娘核）を色で区別する。崩壊した直後の核からは放射線が出る様子を描く。
 */
import type { Palette } from '@/core/theme';
import { formatFixed } from '@/core/format';
import type { CanvasSize } from '@/ui/canvas';
import { CANVAS_FONT, CANVAS_FONT_SMALL, drawBall, drawLabel } from '@/ui/draw';
import { remaining, type DecayParams, type DecayState } from './model';

const HEADER_H = 46;
const PAD = 12;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: DecayParams,
  s: DecayState,
): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  const N0 = s.decayTimes.length;
  const N = remaining(s);

  // 見出し: 残りの数と経過した半減期の数
  drawLabel(
    ctx,
    `残り N = ${N} 個 / ${N0} 個（${formatFixed((100 * N) / N0, 1)} %）`,
    PAD,
    14,
    pal.fg,
    { font: CANVAS_FONT, align: 'left' },
  );
  drawLabel(ctx, `t = ${formatFixed(s.t / p.T, 2)} T`, size.width - PAD, 14, pal.fg, {
    font: CANVAS_FONT,
    align: 'right',
  });
  // 凡例
  drawBall(ctx, PAD + 5, 34, 5, pal.quantity.nucleus, pal.bg);
  drawLabel(ctx, '崩壊していない原子核', PAD + 14, 34, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });
  const lx = PAD + 14 + 132;
  drawBall(ctx, lx + 5, 34, 3, pal.quantity.daughter, pal.bg);
  drawLabel(ctx, '崩壊した原子核', lx + 14, 34, pal.fg, { font: CANVAS_FONT_SMALL, align: 'left' });

  // 格子の大きさ
  const aw = size.width - 2 * PAD;
  const ah = size.height - HEADER_H - PAD;
  const cols = Math.max(1, Math.ceil(Math.sqrt((N0 * aw) / ah)));
  const rows = Math.ceil(N0 / cols);
  const cell = Math.min(aw / cols, ah / rows);
  const ox = PAD + (aw - cell * cols) / 2;
  const oy = HEADER_H + (ah - cell * rows) / 2;
  const r = cell * 0.36;
  // 崩壊の直後に放射線の輪を描く時間（シミュレーション時間。半減期に合わせて見やすくする）
  const flash = p.T / 12;

  for (let i = 0; i < N0; i++) {
    const cx = ox + (i % cols) * cell + cell / 2;
    const cy = oy + Math.floor(i / cols) * cell + cell / 2;
    const td = s.decayTimes[i]!;
    if (td > s.t) {
      ctx.fillStyle = pal.quantity.nucleus;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = pal.quantity.daughter;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    const age = (s.t - td) / flash;
    if (age < 1) {
      // 放射線（広がって消える輪）
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle = pal.quantity.daughter;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + 2.2 * age), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
