import { rmSync, writeFileSync } from "node:fs";
import { loadGpx } from "../../scripts/db/load-gpx";
import { openDb } from "../../scripts/db/db";

const createSchema = (db: ReturnType<typeof openDb>) => {
  db.exec(`
    create table track_point (
      id integer primary key,
      source text not null,
      track_date text not null,
      ts text not null,
      lat real not null,
      lon real not null,
      ele real,
      speed real,
      course real
    );
  `);
};


describe("load gpx", () => {
  const dbFile = "db/test-load.sqlite";
  const gpxFile = "db/test.gpx";

  beforeEach(() => {
    rmSync(dbFile, { force: true });
    rmSync(gpxFile, { force: true });
  });

  afterEach(() => {
    rmSync(dbFile, { force: true });
    rmSync(gpxFile, { force: true });
  });

  it("loads points from a small gpx", async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="1" lon="2"><ele>3</ele><time>2024-01-01T00:00:00Z</time><extensions><speed>1</speed><course>2</course></extensions></trkpt>
      <trkpt lat="2" lon="3"><time>2024-01-01T01:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
    writeFileSync(gpxFile, gpx, "utf-8");

    const db = openDb(dbFile);
    createSchema(db);
    const count = await loadGpx(db, gpxFile, "footprint");

    const rows = db.query("select count(*) as count from track_point").get() as {
      count: number;
    };
    expect(rows.count).toBe(2);
    expect(count).toBe(2);

    db.close();
  });

  it("throws when gpx is missing", async () => {
    const db = openDb(dbFile);
    createSchema(db);

    await expect(loadGpx(db, "db/missing.gpx", "footprint")).rejects.toThrow(
      "GPX file not found"
    );

    db.close();
  });
});
