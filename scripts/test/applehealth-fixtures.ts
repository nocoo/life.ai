import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ensureParentDir = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

export const writeAppleHealthXml = (filePath: string, body: string) => {
  ensureParentDir(filePath);
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<HealthData>\n${body}\n</HealthData>`;
  writeFileSync(filePath, content, "utf-8");
};

export const writeEcgCsv = (filePath: string, lines: string[]) => {
  ensureParentDir(filePath);
  writeFileSync(filePath, lines.join("\n"), "utf-8");
};

export const writeRouteGpx = (filePath: string, points: string[]) => {
  ensureParentDir(filePath);
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><trkseg>\n${points.join("\n")}\n</trkseg></trk>\n</gpx>`;
  writeFileSync(filePath, content, "utf-8");
};
