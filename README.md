# Real-map Disaster Simulator

実在する地理データを2Dゲーム空間へ変換し、避難行動を体験するブラウザ向け試作です。最初のシナリオとして、小平市役所周辺の約600m四方を収録しています。

## 起動

```bash
npm install
npm run dev
```

ビルドとテスト:

```bash
npm test
npm run build
```

## 地図データの更新

```bash
npm run fetch-map
```

`scripts/overpass-query.txt` の範囲をOverpass APIから取得し、`public/data/raw` に原本、`public/data/processed/world.json` にゲーム用データを保存します。実行するたび取得元の最新状態に更新されるため、公開版では生成済みデータを固定して使用してください。

## データと座標

- 地図データ: © OpenStreetMap contributors
- ライセンス: Open Database License (ODbL)
- 対象範囲: south 35.7259, west 139.4742, north 35.7313, east 139.4808
- 中心: 小平市役所付近（35.7286, 139.4775）
- ゲーム座標: 対象範囲の北西を原点とするローカルメートル座標

小範囲の試作なので、緯度経度から局所的なメートル座標への変換には近似式を使用しています。市域以上へ拡大する場合はJGD2011平面直角座標系第IX系（EPSG:6677）を使用してください。

## 注意

本作の危険区域、道路封鎖、避難地点はゲーム動作を確認するための仮想シナリオです。実際の災害予測や避難判断には使用できません。
