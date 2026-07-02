export const BACKSTAGE_ROLE_LABELS = ["集計・記録担当", "賞金・景品対応"] as const;
export const BACKSTAGE_GROUP_LABEL = "裏方(集計・記録/賞金・景品)";
export const DEFAULT_BIAS_THRESHOLD = 0.5;

export interface RoleBiasInput {
  label: string;
  counts: Array<{ userId: string; count: number }>;
}

export interface RoleBiasResult {
  label: string;
  total: number;
  topUserId: string | null;
  topCount: number;
  topShare: number;
  flagged: boolean;
}

/**
 * 各役割について、担当回数が 1 人に threshold 以上集中しているかを判定する。
 * 純粋関数 (DB 非依存) なのでユニットテストで検証できる。
 */
export function detectRoleBias(roles: RoleBiasInput[], threshold: number): RoleBiasResult[] {
  return roles
    .map((role) => {
      const total = role.counts.reduce((sum, entry) => sum + entry.count, 0);
      const top = role.counts.reduce<{ userId: string; count: number } | null>((best, entry) => {
        if (!best || entry.count > best.count) {
          return entry;
        }
        return best;
      }, null);
      const topShare = total > 0 && top ? top.count / total : 0;
      return {
        label: role.label,
        total,
        topUserId: top?.userId ?? null,
        topCount: top?.count ?? 0,
        topShare,
        flagged: total > 0 && topShare >= threshold
      };
    })
    .filter((result) => result.total > 0);
}
