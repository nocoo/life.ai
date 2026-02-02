import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ensureParentDir = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

export const writeGpx = (filePath: string, points: string[]) => {
  ensureParentDir(filePath);
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      ${points.join("\n      ")}
    </trkseg>
  </trk>
</gpx>`;
  writeFileSync(filePath, content, "utf-8");
};
