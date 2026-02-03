import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ensureParentDir = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

export const writePixiuCsv = (filePath: string, rows: string[]) => {
  ensureParentDir(filePath);
  const header = "日期,交易分类,交易类型,流入金额,流出金额,币种,资金账户,标签,备注";
  const content = [header, ...rows].join("\n");
  writeFileSync(filePath, content, "utf-8");
};
