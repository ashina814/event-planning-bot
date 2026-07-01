import { EmbedBuilder } from "discord.js";

export type HelpTopic =
  | "start"
  | "event"
  | "roles"
  | "announce"
  | "timer"
  | "participants"
  | "todo"
  | "expense"
  | "overview"
  | "faq";

export const helpTopics: {
  value: HelpTopic;
  label: string;
  emoji: string;
  description: string;
}[] = [
  { value: "start", label: "はじめかた", emoji: "🏁", description: "統括向け初期設定" },
  { value: "event", label: "イベントを作る", emoji: "🎯", description: "新規作成と状態管理" },
  { value: "roles", label: "担当", emoji: "👥", description: "担当設定と引き継ぎ" },
  { value: "announce", label: "告知文", emoji: "📢", description: "登録・転送・予約" },
  { value: "timer", label: "タイムキーパー", emoji: "⏱️", description: "進行表と次へ操作" },
  { value: "participants", label: "参加者カウント", emoji: "👤", description: "リアクション・投稿集計" },
  { value: "todo", label: "ToDo", emoji: "✅", description: "登録と議事録連携" },
  { value: "expense", label: "出費", emoji: "💰", description: "記録・証明画像・アラート" },
  { value: "overview", label: "カレンダー・統計", emoji: "📅", description: "月次一覧と集計" },
  { value: "faq", label: "よくある質問", emoji: "❓", description: "困ったときの確認先" }
];

export function buildHelpTopicEmbed(topic: HelpTopic): EmbedBuilder {
  switch (topic) {
    case "start":
      return new EmbedBuilder()
        .setTitle("🏁 はじめかた (統括向け初期設定)")
        .setDescription("最初にOWNER_IDのユーザーが `/admin` でBotの設定パネルを開きます。")
        .addFields(
          {
            name: "設定項目",
            value: [
              "• Guild ID",
              "• イベントフォーラム / 公式告知 / 内部お知らせ / 出費ログ",
              "• 議事録 / 自由チャット / 会議VC",
              "• イベント統括ロール / イベンターロール",
              "• 設定完了後、イベンターが `/event new` を使えるようになります。"
            ].join("\n")
          },
          {
            name: "Bot権限",
            value: [
              "• アプリケーションコマンドの使用",
              "• フォーラムチャンネルへの投稿 / スレッド作成 / スレッド内メッセージ送信",
              "• メッセージ編集 / スレッド名変更 / メンバー取得",
              "• 公式告知チャンネルへの送信",
              "• Message Content Intent: 議事録ToDo検出に必要"
            ].join("\n")
          }
        );

    case "event":
      return new EmbedBuilder()
        .setTitle("🎯 イベントを作る・状態を変える")
        .setDescription("イベントの立ち上げから状態管理までの基本操作です。")
        .addFields(
          {
            name: "作成",
            value: [
              "• `/event new <イベント名> [シリーズ名]` で立ち上げます。",
              "• フォーラムに新規スレッドが作成されます。",
              "• 親投稿の下にコントロールパネルが表示されます。"
            ].join("\n")
          },
          {
            name: "状態と日時",
            value: [
              "• [状態] ボタンで状態遷移します。",
              "• 企画中 → 告知中 → 告知済 → 完了、または途中で見送り。",
              "• スレッドタイトルのprefix (【企画中】等) は自動更新されます。",
              "• [日時] ボタンで開催日時を設定します。",
              "• 例: 明日 22:00 / 6/29 22:00 / 2026-06-29 22:00"
            ].join("\n")
          }
        );

    case "roles":
      return new EmbedBuilder()
        .setTitle("👥 担当を決める・引き継ぐ")
        .setDescription("コントロールパネルの [担当] と [引き継ぎ] から操作します。")
        .addFields(
          {
            name: "6つの役割",
            value: [
              "• 主担当",
              "• 司会・進行",
              "• 告知担当",
              "• 集計・記録担当",
              "• 賞金・景品対応",
              "• サポート"
            ].join("\n")
          },
          {
            name: "担当変更と引き継ぎ",
            value: [
              "• 各役割のボタンを押し、ユーザー選択メニューでアサインします。",
              "• 引き継ぎは [引き継ぎ] → 役割選択 → 新担当と残タスクを記入します。",
              "• 引き継ぎ宣言はスレッドに自動投稿され、履歴にも残ります。"
            ].join("\n")
          }
        );

    case "announce":
      return new EmbedBuilder()
        .setTitle("📢 告知文の登録・転送・予約")
        .setDescription("コントロールパネルの [告知文] ボタンから告知文を管理します。")
        .addFields({
          name: "使い方",
          value: [
            "• [告知文] → 一覧を開きます。",
            "• [+ 新規作成] で本文を入力します。Nitro絵文字やDiscord記法もそのまま使えます。",
            "• [プレビュー] は自分にだけ表示されます。",
            "• [転送] で公式告知チャンネルへ送ります。",
            "• 転送は即時または予約できます。例: 明日 22:00",
            "• シリーズ紐付けイベントでは、過去の告知文からコピーできます。"
          ].join("\n")
        });

    case "timer":
      return new EmbedBuilder()
        .setTitle("⏱️ タイムキーパー")
        .setDescription("コントロールパネルの [タイマー] から進行表を設定します。")
        .addFields(
          {
            name: "入力例",
            value: ["```", "22:00 集合", "22:05 告知", "22:15 自己紹介", "```"].join("\n")
          },
          {
            name: "運用",
            value: [
              "• 通知先チャンネルとメンション対象を選べます。",
              "• 事前通知は既定3分前です。",
              "• シリーズ3回目以降は「前回ベースで自動生成」が使えます。",
              "• 参加者数から時間配分を予測します。",
              "• 各セクションの [次へ] ボタンで押した時刻を記録し、次回予測に使います。"
            ].join("\n")
          }
        );

    case "participants":
      return new EmbedBuilder()
        .setTitle("👤 参加者カウント")
        .setDescription("リアクション方式または投稿方式で参加者数を集計します。")
        .addFields(
          {
            name: "2つの方式",
            value: [
              "• リアクション方式: 告知メッセージのリアクション数をカウントします。最大3種類まで。",
              "• 投稿方式: エントリー用スレッドの投稿数をカウントします。1メッセージ = 1人。"
            ].join("\n")
          },
          {
            name: "おすすめ操作",
            value: [
              "• リアクション方式は「メッセージを右クリック → アプリ → 参加者カウント対象に設定」が一番早いです。",
              "• 締切の既定は開催時刻です。",
              "• 締切後のカウントは「遅刻」として別集計されます。"
            ].join("\n")
          }
        );

    case "todo":
      return new EmbedBuilder()
        .setTitle("✅ ToDo・議事録連携")
        .setDescription("コントロールパネルの [ToDo] ボタンからタスクを管理します。")
        .addFields({
          name: "使い方",
          value: [
            "• [+ 追加] で内容・担当・期限を登録します。",
            "• 期限例: 明日 / 6/29 / 6/29 18:00",
            "• 期限当日の朝9時(JST)に、スレッドで担当者へメンションします。",
            "• 議事録チャンネルの【ToDo】または【To Do】セクションに箇条書きすると、Botが検出します。",
            "• 検出後、統括にDM通知され、統括がイベントへ振り分けます。"
          ].join("\n")
        });

    case "expense":
      return new EmbedBuilder()
        .setTitle("💰 出費記録・アラート")
        .setDescription("コントロールパネルの [出費] から記録します。")
        .addFields(
          {
            name: "記録",
            value: [
              "• [出費] → [+ 記録追加] を押します。",
              "• カテゴリ選択 → 方向選択 → 金額・対象者・発生日・メモを入力します。",
              "• モーダル送信後、5分以内に同じチャンネルへ証明画像を送ると自動で紐付きます。",
              "• 出費ログチャンネルに整形版が自動投稿されます。"
            ].join("\n")
          },
          {
            name: "アラート",
            value: [
              "• 閾値超過で統括にDMします。",
              "• 種別: per_tx / per_event / per_month",
              "• 閾値設定は `/events` → 設定 → 出費閾値 から行います。統括のみ操作できます。"
            ].join("\n")
          }
        );

    case "overview":
      return new EmbedBuilder()
        .setTitle("📅 カレンダー・統計")
        .setDescription("`/events` でイベント一覧パネルを開きます。")
        .addFields(
          {
            name: "カレンダー",
            value: "月ごとのイベント一覧を表示します。日付は 日月火水木金土 表記(JST)です。"
          },
          {
            name: "統計",
            value: [
              "• 今月のイベント数",
              "• 出費総額",
              "• シリーズ別開催回数",
              "• 担当回数ランキング"
            ].join("\n")
          }
        );

    case "faq":
      return new EmbedBuilder()
        .setTitle("❓ よくある質問")
        .setDescription("困ったときはここを確認してください。")
        .addFields(
          {
            name: "Q. コントロールパネルが消えた",
            value: "A. スレッド内で [状態] ボタンを押すか、任意のボタンを押すと自動再生成されます。"
          },
          {
            name: "Q. 引き継ぎ宣言を間違えた",
            value: "A. 現状は宣言メッセージを手動編集してください。DB上の担当は再度 [担当] ボタンで変更できます。"
          },
          {
            name: "Q. 出費記録の証明画像を後から追加したい",
            value: "A. 5分を過ぎた場合、同イベントで再度出費を「補填・返金」方向で記録し、備考でリンクしてください。"
          },
          {
            name: "Q. タイムキーパーの予測が変",
            value: "A. シリーズ内の過去5回の中央値を使っています。参加者数を正しく入力すると精度が上がります。"
          }
        );
  }
}
