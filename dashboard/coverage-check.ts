import { readFileSync, existsSync } from "fs";

const THRESHOLD = 90;

interface LcovData {
  linesHit: number;
  linesFound: number;
  functionsHit: number;
  functionsFound: number;
}

function parseLcov(content: string): LcovData {
  const data: LcovData = {
    linesHit: 0,
    linesFound: 0,
    functionsHit: 0,
    functionsFound: 0,
  };

  const lines = content.split("\n");
  for (const line of lines) {
    if (line.startsWith("LH:")) {
      data.linesHit += parseInt(line.slice(3), 10);
    } else if (line.startsWith("LF:")) {
      data.linesFound += parseInt(line.slice(3), 10);
    } else if (line.startsWith("FNH:")) {
      data.functionsHit += parseInt(line.slice(4), 10);
    } else if (line.startsWith("FNF:")) {
      data.functionsFound += parseInt(line.slice(4), 10);
    }
  }

  return data;
}

function main(): void {
  const coveragePath = "./coverage/lcov.info";

  if (!existsSync(coveragePath)) {
    console.error("❌ Coverage file not found:", coveragePath);
    console.error("   Please run tests with coverage first.");
    process.exit(1);
  }

  const coverageData = readFileSync(coveragePath, "utf-8");
  const data = parseLcov(coverageData);

  const linesPct =
    data.linesFound > 0 ? (data.linesHit / data.linesFound) * 100 : 100;
  const functionsPct =
    data.functionsFound > 0
      ? (data.functionsHit / data.functionsFound) * 100
      : 100;

  const failed: string[] = [];

  if (linesPct < THRESHOLD) {
    failed.push(`Lines: ${linesPct.toFixed(2)}% (threshold: ${THRESHOLD}%)`);
  }
  if (functionsPct < THRESHOLD) {
    failed.push(
      `Functions: ${functionsPct.toFixed(2)}% (threshold: ${THRESHOLD}%)`
    );
  }

  if (failed.length > 0) {
    console.error(`\n❌ Coverage below ${THRESHOLD}% threshold:\n`);
    failed.forEach((f) => console.error(`  - ${f}`));
    console.error("");
    process.exit(1);
  }

  console.log(`\n✅ Coverage meets ${THRESHOLD}% threshold`);
  console.log(`   Lines: ${linesPct.toFixed(2)}%`);
  console.log(`   Functions: ${functionsPct.toFixed(2)}%\n`);
}

main();
