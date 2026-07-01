import type { ExpenseCategory, ExpenseDirection } from "../../types/index.js";
import { expenseCategories, expenseDirections } from "../../types/index.js";

export function parseExpenseCategory(input: string): ExpenseCategory {
  const normalized = input.trim();
  const aliases: Record<string, ExpenseCategory> = {
    賞金: "prize",
    景品: "gift",
    運営費: "operation",
    その他: "other"
  };
  const value = aliases[normalized] ?? normalized;
  if ((expenseCategories as readonly string[]).includes(value)) {
    return value as ExpenseCategory;
  }
  throw new Error("カテゴリは prize / gift / operation / other のいずれかです。");
}

export function parseExpenseDirection(input: string): ExpenseDirection {
  const normalized = input.trim();
  const aliases: Record<string, ExpenseDirection> = {
    出費: "out",
    支出: "out",
    補填: "in",
    返金: "in",
    入金: "in"
  };
  const value = aliases[normalized] ?? normalized;
  if ((expenseDirections as readonly string[]).includes(value)) {
    return value as ExpenseDirection;
  }
  throw new Error("方向は out / in のいずれかです。");
}

export function parseAmount(input: string): number {
  const normalized = input.replace(/[,，\s]/g, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error("金額は正の整数で入力してください。");
  }

  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("金額は正の整数で入力してください。");
  }
  return amount;
}
