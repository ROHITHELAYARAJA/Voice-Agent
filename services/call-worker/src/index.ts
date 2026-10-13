import { setTimeout } from "node:timers/promises";
import { configuration } from "../../../apps/api/src/config.ts";
import { generateWeeklyInsights } from "../../journal-processor/src/weekly.ts";
import { database } from "../../../apps/api/src/db.ts";
import {
  materializeSchedules,
  processJob,
  reconcile,
  type Job,
} from "./worker.ts";
const env = configuration(),
  db = database(env);
let running = true;
let lastInsights = 0;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    running = false;
  });
while (running) {
  try {
    await materializeSchedules(db.pool);
    const result = await db.pool.query<Job>(
      "select * from public.claim_call_jobs(10)",
    );
    for (const job of result.rows) await processJob(db.pool, env, job);
    await reconcile(db.pool, env);
    if (Date.now() - lastInsights > 3600000) {
      await generateWeeklyInsights(db.pool);
      lastInsights = Date.now();
    }
  } catch {
    process.stderr.write(
      "Nila worker: cycle failed; retrying without redialing uncertain calls.\n",
    );
  }
  if (running) await setTimeout(10000);
}
await db.pool.end();
