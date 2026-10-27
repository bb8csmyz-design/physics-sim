# CLAUDE.md — 物理シミュレーション学習アプリ 開発規約

高校物理〜大学入試レベルの物理シミュレーション学習アプリ。Vite + TypeScript（UI フレームワークなし）、
GitHub Pages に自動デプロイ、PWA でオフライン動作。**このファイルの規約は今後のすべてのセッションで守ること。**

## コマンド

```bash
npm run dev          # 開発サーバー
npm test             # Vitest（物理テスト含む）
npm run check        # lint + format:check + typecheck + test（コミット前に必ず通す）
npm run build        # 型チェック + 本番ビルド（dist/）
npm run format       # Prettier で整形
```

作業の完了報告・コミットの前に `npm run check && npm run build` が通ることを確認する。

## 技術方針

- **UI フレームワークは使わない。** DOM は `src/core/dom.ts` の `h()` で組み立て、描画は Canvas 2D。
  依存を増やす前に、既存の共通部品で足りないか検討する。
- 数式は KaTeX（`src/ui/math.ts`）。KaTeX は単元ページでのみ読み込む（トップページから import しない）。
- ルーティングはハッシュ方式（`#/<分野>/<単元>`）。GitHub Pages でサーバー設定が不要なため。
- TypeScript は strict + `noUncheckedIndexedAccess`。`any` は使わない。import は `@/` エイリアス（= `src/`）。

## フォルダ構成

```
src/
  main.ts                 起動・ルーティング・テーマ切替・Service Worker 登録
  router.ts               ハッシュの解釈
  core/                   UI に依存しない基盤
    dom.ts                h() / symbol() / Disposer
    format.ts             数値表示（負号 U+2212、有効数字）
    params.ts             ParamSpec 型・paramCorners()（テスト用の全隅の組）
    contour.ts            sampleGrid() / contourSegments()（等値線。等電位線などに使う）
    theme.ts              ライト/ダーク、Canvas 用パレット、物理量の色
    ticks.ts              グラフ目盛り
    sim/runner.ts         SimulationRunner（固定刻みの時間発展 + rAF 描画。timeScale でスロー再生、isFinished で衝突などの終了）
    physics/
      integrators.ts      数値積分（Euler, 中点法, RK4, シンプレクティック Euler, 速度ベルレ, 吉田4次）
      analysis.ts         検証用（相対誤差・収束次数・周期推定）
      special.ts          特殊関数（完全楕円積分。単振り子の厳密な周期など）
      constants.ts        物理定数（g = 9.8）
  ui/                     共通 UI 部品（全単元で使う）
    layout.ts             mountSimulationLayout()  単元ページの標準レイアウト
    params.ts             createParamPanel() / createSlider() / createToggle() / createChoice()（スイッチの切り替えなど択一）
    playback.ts           createPlaybackControls() / createTimeReadout()（unit: 's' / 'ms' / 'T'、注記「1/n 倍のスロー再生」と setNote）
    timeGraph.ts          createTimeGraph() / createGraphTabs()（timeUnit: 'ms' で横軸をミリ秒表示）
    valuePanel.ts         createValuePanel()
    math.ts               tex() / richText()
    theory.ts             theory() / section() / p() / eq() / ul() / note() / question()
    canvas.ts             createResponsiveCanvas() / fitViewport()
    draw.ts               drawArrow / drawVector / drawSpring / drawSpringBetween / drawBlock / drawBall /
                          drawFixture / drawFixturePolygon / drawPath / drawEnergyBars / drawScaleBar /
                          drawLabel / drawSymbol / drawBarChart
                          回路: drawCircuitElement（抵抗・コンデンサー・コイル・電池・交流電源）/ drawWire /
                          drawTerminal / drawJunction / drawFlowDots（電流の流れ）、drawOutOfPlaneMark（⊙ ⊗）
  pages/                  トップページ・単元ページの枠
  styles/                 tokens.css（色・余白）, base.css, components.css
  units/
    types.ts              UnitMeta / UnitModule
    fields.ts             分野一覧と「準備中」の単元リスト
    registry.ts           単元の自動登録（import.meta.glob）
    structure.test.ts     単元フォルダ規約の自動検査
    <分野>/<単元>/        1 単元 = 1 フォルダ
```

分野フォルダ名は `mechanics`（力学）, `thermal`（熱）, `waves`（波動）, `electromagnetism`（電磁気）,
`atomic`（原子）の 5 つに固定。単元フォルダ名は英語の kebab-case（URL になる）。

## 単元の追加手順

見本は `src/units/mechanics/spring-oscillation/`。新しい単元はこのフォルダをコピーして作り替える。

1. **フォルダを作る**: `src/units/<分野>/<単元-slug>/`
2. **必須ファイル**（`structure.test.ts` が存在を検査する）
   | ファイル            | 役割                                                                                                                                                  |
   | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `meta.ts`           | `export const meta: UnitMeta`（title, summary, level, order, keywords）                                                                               |
   | `model.ts`          | 物理モデル。**純粋関数のみ・DOM/UI に依存しない**（ESLint で禁止）。`PARAMS`（ParamSpec 配列）、`DT`、初期状態、`step()`、解析解・保存量などを export |
   | `model.test.ts`     | 物理的な正しさのテスト（下記ルール）                                                                                                                  |
   | `index.ts`          | `export default` の `UnitModule`。共通部品を組み合わせて UI を作る                                                                                    |
   | `scene.ts`（推奨）  | Canvas への描画。計算は model.ts を呼ぶだけ                                                                                                           |
   | `theory.ts`（推奨） | 解説文。`ui/theory.ts` の部品で書く                                                                                                                   |
3. **登録作業は不要**。`registry.ts` が自動で一覧とルーティングに載せる。
4. `fields.ts` の該当分野の `planned` から、実装した単元名を**削除**する（残っているとテストが落ちる）。
   `meta.title` は planned に書かれていた名前とそろえる。
5. `meta.order` は分野内で教科書の順序になるよう 10 刻みで付ける（重複禁止）。
6. `npm run check && npm run build` を通し、ブラウザ（スマホ幅 390px とデスクトップ、ライト/ダーク）で表示を確認する。

### index.ts の定型（見本単元と同じ流れにする）

1. `createParamPanel(PARAMS, ...)` — 初期条件・系の定数が変わったら `runner.reset()` して t = 0 からやり直す
2. `createResponsiveCanvas({ draw })` — draw は `runner.state` を読んで scene.ts の関数を呼ぶ
3. `createTimeGraph` × n → `createGraphTabs`
4. `createValuePanel`（現在値）＋必要なら「この条件での値」（周期など定数）
5. `new SimulationRunner({ dt: DT, init, step, onStep: グラフ記録, onReset: グラフ消去, render, isInvalid })`
   （着地・落下・衝突などで運動が終わる単元は `isFinished` で自動停止させる）
6. `disposer.add(() => runner.destroy())`
7. `mountSimulationLayout(root, { stage, playback, status, params, options, values, graphs, theory })`

イベントリスナー・タイマー・ResizeObserver は必ず `ctx.disposer` に登録して後片付けする。

## 物理的な正しさをテストで保証するルール

**物理モデルを追加・変更したら、必ず `model.test.ts` で正しさを示すこと。テストのない物理は追加しない。**

1. **解析解があれば解析解と比較する**（例: 単振動の x(t)、放物運動の軌道、RC 回路の指数関数）。
2. **公式との一致**: 教科書・入試の公式（周期・最高点の高さ・終端速度など）がシミュレーション結果から再現されること。
   値を測る場合は `core/physics/analysis.ts`（`estimatePeriod` など）を使う。
3. **保存則**: 保存量（力学的エネルギー・運動量・角運動量・電荷など）が保存されること。散逸がある系では、
   散逸量（摩擦による発熱・ジュール熱など）を含めた収支が合うこと。長時間でドリフトしないことも確かめる。
4. **パラメータ範囲の全域**: `paramCorners(PARAMS)` でスライダーの最小・既定・最大の全組み合わせについて検査する。
   UI で選べる値で物理が破綻してはならない。
5. **定性的な性質・極限**: 等時性、対称性、パラメータを 0 や極限にしたときの振る舞い（静止したままなど）。
6. **許容誤差には根拠をコメントで書く**（例: 「速度ベルレ法のエネルギー誤差は (ωΔt)²/4 程度」）。
   テストを通すために根拠なく許容誤差を緩めない。落ちたらまずモデルか刻み幅を疑う。
7. **刻み幅 DT の妥当性もテストする**（例: パラメータ範囲全体で ωΔt ≤ 0.04）。
8. テストは 1 ファイル数秒以内に収める（CI 時間とタイムアウト対策）。

### 数値積分法の選び方（`core/physics/integrators.ts`）

- 保存力だけの力学系（ばね・重力・単振り子・惑星運動）→ **シンプレクティック法**
  （`velocityVerletStep`、高精度が必要なら `yoshida4Step`）。エネルギーが単調に増減しない。
- 速度に依存する力（空気抵抗・ローレンツ力・減衰）や一般の微分方程式（回路など）→ **`rk4Step`**。
- `eulerStep` は比較・教育用。実際のシミュレーションには使わない。
- 解析解で書ける運動（等加速度運動など）は、数値積分せずに解析解をそのまま使ってよい。
- 新しい積分法を足したら `integrators.test.ts` に収束次数のテストを追加する。

### 物理の慣例

- 単位は SI。重力加速度は `G_ACCEL = 9.8`（入試の慣例）。物理定数は `constants.ts` から使う（直書きしない）。
- 座標の向き・原点は model.ts の先頭コメントに必ず書く（例: 「つりあいの位置を原点、右向き正」）。
- 記号・用語は高校教科書に合わせる（ばね定数 k、角振動数 ω、運動エネルギー K、位置エネルギー U など）。

## UI の統一ルール

- **言語は日本語**。用語は高校教科書に合わせる。ボタン名は「再生 / 一時停止 / リセット」など既存部品の表記を使う。
- **レイアウトは `mountSimulationLayout()` を必ず使う**。セクションの名前と並び（シミュレーション → パラメータ →
  表示 → グラフ → 現在の値 → 解説）を単元ごとに変えない。独自のレイアウトや独自の再生ボタンを作らない。
- **共通部品を使う**: スライダーは `createParamPanel`、グラフは `createTimeGraph`、値表示は `createValuePanel`、
  数式は `tex` / `richText`、矢印・ばね・壁などの描画は `ui/draw.ts`。足りない機能は共通部品側に追加する
  （単元内で似た部品を作らない）。
- **色**: 色は `styles/tokens.css` の CSS 変数と `getPalette()` 経由でのみ指定する（直書き禁止）。ダークモードで
  必ず確認する。**物理量の色は全単元共通**（`--q-*` / `QUANTITY_COLORS`）:
  位置 = 青, 速度 = 橙, 加速度 = 緑, 力 = 赤, 運動エネルギー = 黄, 位置エネルギー = 紫, 力学的エネルギー = 灰,
  電場 = ピンク, 磁場 = 青緑, 電流 = 黄土, 熱 = ローズ, 運動量 = 茶。グラフ・矢印・値パネルの色見本で同じ色を使う。
  新しい物理量の色が必要なら `tokens.css`（ライト・ダーク両方）と `theme.ts` の両方に追加する。
- **矢印（ベクトル）**: 速度・力などは `drawArrow` で物理量の色を使い、記号のラベル（`v`, `F`）を付ける。
  長さはパラメータ範囲で画面からはみ出さないよう規格化する。
- **縮尺**: `fitViewport()` で縦横同じ縮尺にする（形をゆがめない）。目盛りか基準長を描いて実寸が分かるようにする。
- **数値表示**: `formatFixed` / `formatSig` を使う（負号は −）。単位は値の後ろに小さく。
- **パラメータ**: 日本語名 + 記号 + 単位を必ず付ける（`label`, `symbol`, `unit`）。範囲は入試で現れる現実的な値に。
- **解説**: `theory.ts` で「原理・公式 → グラフや数値の読み方 → 入試のポイント（note）→ 考えてみよう（question）
  → 数値計算について」の順を基本にする。考えてみようの答えはシミュレーションで確かめられる内容にする。
- **スマホ対応**: 幅 390px で横スクロールが出ないこと。タップ領域は 40px 以上。Canvas は `mobileAspect` で縦を確保。
- **アクセシビリティ**: Canvas には `ariaLabel` で内容の説明を付ける。キーボード操作（Space/R/→）は再生コントロールが提供する。

## PWA・デプロイ

- `vite-plugin-pwa`（generateSW）で全アセット（遅延読み込みの単元チャンク・KaTeX フォント含む）をプリキャッシュする。
  新しい種類のアセット（例: `.mp3`, `.json`）を追加したら `vite.config.ts` の `globPatterns` に加える。
- 新バージョン検出時は「更新」ボタン付きの通知を出す（`registerType: 'prompt'`）。
- `main` への push で GitHub Actions（`.github/workflows/deploy.yml`）が lint / test / build 後に GitHub Pages へデプロイ。
  `BASE_PATH=/<リポジトリ名>/` でビルドされる。アプリ内の URL は相対 / ハッシュで書き、`/` 始まりの絶対パスを使わない
  （`index.html` 内の `/favicon.svg` などは Vite がベースパスに書き換える）。
- アイコン（`public/icons/*.png`）は `public/favicon.svg` から生成したもの。デザインを変えたら作り直す。
