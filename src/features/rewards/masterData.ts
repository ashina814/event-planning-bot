export const defaultEventRewardLabels = [
  "主担当",
  "司会・進行",
  "告知担当",
  "集計・記録担当",
  "賞金・景品対応",
  "サポート"
] as const;

export const defaultRoleRewards = [
  { roleLabel: "主担当", amount: 15_000 },
  { roleLabel: "司会・進行", amount: 10_000 },
  { roleLabel: "告知担当", amount: 7_000 },
  { roleLabel: "集計・記録担当", amount: 7_000 },
  { roleLabel: "賞金・景品対応", amount: 5_000 },
  { roleLabel: "サポート", amount: 3_000 },
  { roleLabel: "振り返り記録", amount: 3_000 },
  { roleLabel: "議事録作成", amount: 5_000 },
  { roleLabel: "企画案採用", amount: 5_000 }
] as const;

export const defaultBaseSalaryGrades = [
  { name: "通常イベンター", amount: 50_000, monthlyCap: 130_000 },
  { name: "統括", amount: 190_000, monthlyCap: null }
] as const;

export const defaultScaleMultipliers = {
  small: 0.7,
  normal: 1.0,
  medium: 1.3,
  large: 1.6,
  special: 2.0
} as const;
