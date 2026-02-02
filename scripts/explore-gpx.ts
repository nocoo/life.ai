const gpxPath = "data/footprint/20260202.gpx";

const file = Bun.file(gpxPath);
if (!(await file.exists())) {
  console.error(`GPX file not found: ${gpxPath}`);
  process.exit(1);
}

const xml = await file.text();

const structureMap = new Map<
  string,
  { attributes: Set<string>; children: Set<string> }
>();

const tagRegex = /<[^>]+>/g;
const stack: string[] = [];
let totalPoints = 0;

const ensureEntry = (name: string) => {
  if (!structureMap.has(name)) {
    structureMap.set(name, { attributes: new Set(), children: new Set() });
  }
  return structureMap.get(name)!;
};

const addChild = (parent: string | undefined, child: string) => {
  if (!parent) return;
  const entry = ensureEntry(parent);
  entry.children.add(child);
};

const parseAttributes = (raw: string) => {
  const attrs: string[] = [];
  const attrRegex = /([A-Za-z0-9:_-]+)\s*=\s*"[^"]*"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(raw))) {
    attrs.push(match[1]);
  }
  const singleQuoteRegex = /([A-Za-z0-9:_-]+)\s*=\s*'[^']*'/g;
  while ((match = singleQuoteRegex.exec(raw))) {
    attrs.push(match[1]);
  }
  return attrs;
};

let tagMatch: RegExpExecArray | null;
while ((tagMatch = tagRegex.exec(xml))) {
  const tag = tagMatch[0];
  if (tag.startsWith("<?") || tag.startsWith("<!")) continue;

  const closeMatch = tag.match(/^<\s*\/\s*([^\s>]+)\s*>/);
  if (closeMatch) {
    stack.pop();
    continue;
  }

  const openMatch = tag.match(/^<\s*([^\s/>]+)([^>]*)>/);
  if (!openMatch) continue;
  const name = openMatch[1];
  const rawAttrs = openMatch[2] ?? "";
  const isSelfClosing = /\/\s*>$/.test(tag);

  ensureEntry(name);
  addChild(stack[stack.length - 1], name);

  const attrs = parseAttributes(rawAttrs);
  if (attrs.length > 0) {
    const entry = ensureEntry(name);
    for (const attr of attrs) entry.attributes.add(attr);
  }

  if (name === "trkpt") totalPoints += 1;
  if (!isSelfClosing) stack.push(name);
}

let minTime: Date | null = null;
let maxTime: Date | null = null;
const perDayCounts = new Map<string, number>();

const timeRegex = /<time>([^<]+)<\/time>/g;
let timeMatch: RegExpExecArray | null;
while ((timeMatch = timeRegex.exec(xml))) {
  const time = new Date(timeMatch[1].trim());
  if (Number.isNaN(time.getTime())) continue;

  if (!minTime || time < minTime) minTime = time;
  if (!maxTime || time > maxTime) maxTime = time;

  const day = time.toISOString().slice(0, 10);
  perDayCounts.set(day, (perDayCounts.get(day) ?? 0) + 1);
}

const daysWithData = perDayCounts.size;
const averagePerDay = daysWithData > 0 ? totalPoints / daysWithData : 0;

const sortedStructures = Array.from(structureMap.entries()).sort((a, b) =>
  a[0].localeCompare(b[0])
);

console.log("GPX summary");
console.log(`- file: ${gpxPath}`);
console.log(`- file size: ${file.size} bytes`);
console.log(`- track points: ${totalPoints}`);
console.log(
  `- time range: ${minTime?.toISOString() ?? "n/a"} -> ${
    maxTime?.toISOString() ?? "n/a"
  }`
);
console.log(`- days with data: ${daysWithData}`);
console.log(`- avg points per day: ${averagePerDay.toFixed(2)}`);

if (daysWithData > 0) {
  const topDays = Array.from(perDayCounts.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  console.log("- daily counts:");
  for (const [day, count] of topDays) {
    console.log(`  - ${day}: ${count}`);
  }
}

console.log("- structures:");
for (const [name, info] of sortedStructures) {
  const attrs = Array.from(info.attributes).sort();
  const children = Array.from(info.children).sort();
  console.log(
    `  - ${name} | attributes: ${attrs.length ? attrs.join(", ") : "(none)"} | children: ${
      children.length ? children.join(", ") : "(none)"
    }`
  );
}
