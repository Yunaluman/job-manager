import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validateDailyBatch } from "../shared/domain/daily-proposals.mjs";
// Run only after the human-confirmed CSV-to-JobPilot transition.
const [source, dataDirectory] = process.argv.slice(2);
if (!source || !dataDirectory || process.argv.length !== 4)
  throw Error(
    "Usage: node scripts/enqueue-daily-proposals.mjs <batch.json> <JobPilot-data-directory>",
  );
const batch = JSON.parse(await readFile(resolve(source), "utf8"));
validateDailyBatch(batch);
if (Buffer.byteLength(JSON.stringify(batch), "utf8") > 2 * 1024 * 1024)
  throw Error("Batch exceeds 2 MiB.");
const pending = join(resolve(dataDirectory), "daily-inbox", "pending");
await mkdir(pending, { recursive: true });
const name = randomUUID() + ".json",
  temporary = join(pending, name + ".tmp"),
  destination = join(pending, name);
await writeFile(temporary, JSON.stringify(batch, null, 2), {
  flag: "wx",
  mode: 0o600,
});
await rename(temporary, destination);
console.log(destination);
