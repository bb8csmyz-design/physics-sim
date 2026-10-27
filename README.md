# 物理シミュレーション学習

高校物理〜大学入試レベルの現象を、パラメータを変えながら動かして確かめる学習用 Web アプリです。
グラフ・数式（KaTeX）・解説つき。スマホのホーム画面に追加でき、オフラインでも動きます（PWA）。

- 分野: 力学 / 熱 / 波動 / 電磁気 / 原子
- 実装済みの単元: ばねの単振動（ほかは順次追加）

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # lint + 整形チェック + 型チェック + テスト
npm run build    # dist/ に本番ビルド
```

開発の規約（フォルダ構成・単元の追加手順・物理テストのルール・UI の統一ルール）は [CLAUDE.md](./CLAUDE.md) を参照。

## デプロイ（GitHub Pages）

`main` ブランチへの push で GitHub Actions がテストとビルドを行い、GitHub Pages に公開します。
初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。
