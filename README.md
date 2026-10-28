# training-log

筋肥大向けトレーニング記録アプリ。**記録専用。**分析は Obsidian Vault 側（`projects/training/`）で行う。

```
ジム（このPWA）  記録のみ。IndexedDB に追記で溜める
      ↓  ship() … 現在は手動エクスポート（共有シート）
Vault内 JSONL（追記のみ）
      ↓
Mac（Vault / Claudian + DuckDB）  1RM計算・MAD・回復判定
```

## 記録する列

セット単位で `種目ID / 重量 / レップ / RIR / 完了時刻` の4列（+種目参照）、日単位で体重。
器具タイプ・部位・RPE・レスト・体調は意図的に持たない。根拠は Vault の
`projects/training/記録項目は落とす側で決まった`。

## 使う

```sh
npm run dev                # 開発
npm run build && npm run preview   # 実機確認（--host でLANに出る）
node scripts/gen-icons.mjs # アイコン再生成（依存なし）
```

**iPhoneではホーム画面に追加して使う。**Safariはスクリプト書き込みストレージを
7日間の未使用で破棄し、インストール済みPWAだけが対象外（この前提は未検証）。
インストールされていない状態では画面上部に警告が出る。

Service Worker は secure context が要るので、実機インストールには HTTPS か
`localhost` が必要。LAN の生HTTPではインストールできない。

## 旧実装から引き継いだ決定

2026-09-03 の vanilla JS 実装を置き換えたもの（履歴の最初のコミットに残してある）。
そのとき決めていて、今回そのまま持ってきたものが2つある。

- **動作パターン16枠のIDと名称。**Leg の5枠目は元の分類器のフォールバック `"その他"` を
  `下腿（カーフ）` に置き換えたもので、実測ではなく設計判断である
- **追記のみ。セットは物理削除しない。**取り消しは `voidedAt` を立てるだけで行は残る。
  同期を後から足すとき、追記のみなら競合しないため

**IndexedDB の名前は `training-log` ではなく `training` にしてある。**旧実装の
`training-log` DB はスキーマが違うので、同名にすると旧データを壊す。旧DBはそのまま
残っているので、中に記録があるなら移行は別途やる。

## 同期経路は未決

差し替わるのは `src/lib/export.ts` の `ship()` 1関数だけ。
`exportJSONL()` は経路に依存しない純関数で、全レコードが ULID を持つため
期間の重なった搬出で出る重複行は Vault 側で `ulid` により一意化できる。
