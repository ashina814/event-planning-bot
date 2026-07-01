# Event Planning Bot

Discord のイベント企画室向け bot です。イベント作成、役割管理、告知、タイムキーパー、参加者カウント、ToDo、出費記録、月次カレンダーと統計を扱います。

## セットアップ

Node.js は 22 LTS 推奨です。

```bash
pnpm install
cp .env.example .env
```

`.env` に入れるのは次の3つだけです。

- `DISCORD_TOKEN`: Discord Bot Token
- `CLIENT_ID`: Discord Application Client ID
- `OWNER_ID`: `/admin` を開けるあなたの Discord User ID

任意設定:

- `DB_PATH`: SQLite DB の保存先。既定値は `./data/bot.db`
- `TZ`: `Asia/Tokyo`
- `LOG_LEVEL`: `info`

Guild ID、チャンネル ID、ロール ID は bot 起動後に `/admin` から設定します。管理パネルを開けるのは `.env` の `OWNER_ID` と一致するユーザーだけです。

## 管理パネル

`/admin` で以下を設定します。

- Guild ID
- イベントフォーラム
- 公式告知チャンネル
- 内部お知らせチャンネル
- 出費ログチャンネル
- 議事録チャンネル
- 自由チャット
- 会議 VC
- イベント統括ロール
- イベンターロール

## コマンド登録

```bash
pnpm run register
```

現在はグローバルコマンドとして登録します。Discord 側の反映に少し時間がかかることがあります。

## 起動

開発:

```bash
pnpm run dev
```

本番:

```bash
pnpm run build
pnpm start
```

systemd 用の雛形は `ecosystem/event-bot.service` にあります。

## 主な機能

- `/event new <title> [series]`: イベントフォーラムに企画スレッドとコントロールパネルを作成
- `/events`: 進行中イベントの一覧、カレンダー、統計
- `/help`: 簡易ヘルプ
- `/admin`: OWNER_ID 専用の設定パネル
- イベント内パネル: 役割変更、状態変更、日程設定、引き継ぎ、告知、タイマー、参加者、ToDo、出費
- 議事録チャンネルの ToDo 候補検出
- 出費証明画像のフォローアップと出費ログ投稿
- scheduled_jobs による告知予約、リマインダー、自動進行

## Discord 側の権限

bot には少なくとも以下を付けてください。

- アプリケーションコマンドの使用
- フォーラムチャンネルへの投稿
- スレッド作成
- スレッド内メッセージ送信
- メッセージ編集
- スレッド名変更
- メンバー取得
- 公式告知チャンネルへの送信

`Message Content Intent` は議事録 ToDo 検出に使います。Discord Developer Portal で有効化してください。

## テスト

```bash
pnpm test
```
