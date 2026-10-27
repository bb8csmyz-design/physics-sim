/**
 * Canvas 上の編集操作（タップで配置・ドラッグで移動・糸やばねをつなぐ・初速度の矢印を引く）。
 * 配置の書き換えは design.ts の関数に任せ、ここはポインター操作の解釈だけを担う。
 */
import type { Disposer } from '@/core/dom';
import type { Vec2 } from './collide';
import {
  BLOCK_SPECS,
  addBody,
  addFixture,
  addJoint,
  clamp,
  endpointAt,
  endpointPos,
  findBody,
  hitTest,
  moveTo,
  selectionPos,
  updateProps,
  type Selection,
} from './design';
import type { Endpoint, SandboxDesign } from './model';
import { ARROW_SECONDS, sandboxViewport, toWorld, velocityHandle } from './scene';

export type Tool =
  'select' | 'ball' | 'block' | 'floor' | 'wall' | 'incline' | 'pulley' | 'spring' | 'string';

/** 配置の変わり方（move: 位置だけ、props: 値だけ、structure: 部品の増減） */
export type ChangeKind = 'move' | 'props' | 'structure';

export interface EditorHost {
  canvas: HTMLCanvasElement;
  design(): SandboxDesign;
  tool(): Tool;
  /** 部品を置いたあとは「選択・移動」に戻す */
  setTool(tool: Tool): void;
  selection(): Selection | null;
  select(sel: Selection | null): void;
  /** 方眼（0.05 m）にそろえるか */
  snap(): boolean;
  /** 編集を始める前に呼ぶ（運動の途中なら t = 0 に戻す） */
  beginEdit(): void;
  changed(kind: ChangeKind): void;
  setPreview(p: { from: Vec2; to: Vec2 } | null): void;
  /** 操作できなかった理由を知らせる */
  notify(message: string): void;
}

/** 指で押しやすいよう、当たり判定を広げる距離 [px] */
const HIT_PX = 12;
const SNAP = 0.05;
/** これ以上動いたらドラッグとみなす [px] */
const DRAG_PX = 4;

type Drag =
  | { mode: 'move'; sel: Selection; offset: Vec2; moved: boolean; startPx: Vec2 }
  | { mode: 'velocity'; id: string; moved: boolean; startPx: Vec2 }
  | { mode: 'connect'; kind: 'spring' | 'string'; start: Endpoint; from: Vec2 };

export function attachEditor(host: EditorHost, disposer: Disposer): void {
  const { canvas } = host;
  let drag: Drag | null = null;

  const pointer = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const vp = sandboxViewport({ width: rect.width, height: rect.height });
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    return { world: toWorld(vp, px, py), px: { x: px, y: py }, tol: HIT_PX / vp.scale };
  };
  const snapped = (p: Vec2): Vec2 =>
    host.snap() ? { x: Math.round(p.x / SNAP) * SNAP, y: Math.round(p.y / SNAP) * SNAP } : p;

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    host.beginEdit();
    const { world: p, px, tol } = pointer(ev);
    const d = host.design();
    const tool = host.tool();
    ev.preventDefault();

    if (tool === 'select') {
      const sel = host.selection();
      if (sel?.type === 'body') {
        const hnd = velocityHandle(d, sel.id);
        if (hnd && Math.hypot(hnd.x - p.x, hnd.y - p.y) <= tol) {
          drag = { mode: 'velocity', id: sel.id, moved: false, startPx: px };
          canvas.setPointerCapture(ev.pointerId);
          return;
        }
      }
      const hit = hitTest(d, p.x, p.y, tol);
      host.select(hit);
      if (hit && hit.type !== 'joint') {
        const base = selectionPos(d, hit);
        if (base) {
          drag = {
            mode: 'move',
            sel: hit,
            offset: { x: base.x - p.x, y: base.y - p.y },
            moved: false,
            startPx: px,
          };
          canvas.setPointerCapture(ev.pointerId);
        }
      }
      return;
    }

    if (tool === 'spring' || tool === 'string') {
      const start = endpointAt(d, p.x, p.y, tol);
      const s = 'x' in start ? snapped(start) : start;
      const from = endpointPos(d, s) ?? p;
      drag = { mode: 'connect', kind: tool, start: s, from };
      host.setPreview({ from, to: p });
      canvas.setPointerCapture(ev.pointerId);
      return;
    }

    // 部品を置く
    const q = snapped(p);
    if (tool === 'ball' || tool === 'block') {
      const b = addBody(d, tool, q.x, q.y);
      if (!b) {
        host.notify('物体は 12 個までです');
        return;
      }
      host.select({ type: 'body', id: b.id });
    } else {
      const f = addFixture(d, tool, q.x, q.y);
      if (!f) {
        host.notify('固定物は 24 個までです');
        return;
      }
      host.select({ type: 'fixture', id: f.id });
    }
    host.setTool('select');
    host.changed('structure');
  };

  const onMove = (ev: PointerEvent) => {
    if (!drag) return;
    const { world: p, px } = pointer(ev);
    const d = host.design();
    if (drag.mode === 'connect') {
      host.setPreview({ from: drag.from, to: p });
      return;
    }
    if (!drag.moved && Math.hypot(px.x - drag.startPx.x, px.y - drag.startPx.y) < DRAG_PX) return;
    drag.moved = true;
    if (drag.mode === 'move') {
      const q = snapped({ x: p.x + drag.offset.x, y: p.y + drag.offset.y });
      moveTo(d, drag.sel, q.x, q.y);
      host.changed('move');
    } else {
      const b = findBody(d, drag.id);
      if (!b) return;
      const vmax = BLOCK_SPECS.find((s) => s.key === 'vx')!.max;
      const r = (v: number) => clamp(Math.round(v * 10) / 10, -vmax, vmax);
      updateProps(
        d,
        { type: 'body', id: b.id },
        {
          vx: r((p.x - b.x) / ARROW_SECONDS),
          vy: r((p.y - b.y) / ARROW_SECONDS),
        },
      );
      host.changed('props');
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!drag) return;
    const current = drag;
    drag = null;
    const d = host.design();
    if (current.mode === 'connect') {
      host.setPreview(null);
      const { world: p, tol } = pointer(ev);
      const end = endpointAt(d, p.x, p.y, tol);
      const j = addJoint(d, current.kind, current.start, 'x' in end ? snapped(end) : end);
      if (!j) {
        host.notify(
          '糸・ばねは、物体から別の物体・滑車・壁などの場所へドラッグしてつなぎます（少なくとも一方の端は物体）',
        );
        return;
      }
      host.select({ type: 'joint', id: j.id });
      host.setTool('select');
      host.changed('structure');
    } else if (current.mode === 'move' && current.moved && current.sel.type === 'body') {
      // 離したときに、固定物や他の物体との重なりを解消する（斜面に置いた箱は斜面にそろう）
      const pos = selectionPos(d, current.sel);
      if (pos) moveTo(d, current.sel, pos.x, pos.y, true);
      host.changed('props');
    }
  };

  const onCancel = () => {
    if (drag?.mode === 'connect') host.setPreview(null);
    drag = null;
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  disposer.add(() => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
  });
}
