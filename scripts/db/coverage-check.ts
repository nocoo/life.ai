import { readFile } from "node:fs/promises";

const filePath = "coverage/lcov.info";
const text = await readFile(filePath, "utf-8");

let linesFound = 0;
let linesHit = 0;
let funcsFound = 0;
let funcsHit = 0;

for (const line of text.split("\n")) {
  if (line.startsWith("LF:")) linesFound += Number(line.slice(3));
  if (line.startsWith("LH:")) linesHit += Number(line.slice(3));
  if (line.startsWith("FNF:")) funcsFound += Number(line.slice(4));
  if (line.startsWith("FNH:")) funcsHit += Number(line.slice(4));
}

const linePct = linesFound === 0 ? 100 : (linesHit / linesFound) * 100;
const funcPct = funcsFound === 0 ? 100 : (funcsHit / funcsFound) * 100;
const threshold = 90;

const fmt = (n: number) => n.toFixed(2);
console.log(`Coverage lines: ${fmt(linePct)}%`);
console.log(`Coverage funcs: ${fmt(funcPct)}%`);

if (linePct < threshold || funcPct < threshold) {
  console.error(`Coverage below ${threshold}%`);
  process.exit(1);
}
