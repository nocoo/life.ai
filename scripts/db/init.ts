import { readFile } from "node:fs/promises";
import { openDb } from "./db";

const schemaPath = new URL("./schema.sql", import.meta.url);
const schema = await readFile(schemaPath, "utf-8");

const db = openDb();
db.exec(schema);
db.close();

console.log("DB initialized");
