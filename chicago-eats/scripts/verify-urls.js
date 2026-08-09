// One-off cleanup: walk every un-hidden row, check its URL is still reachable,
// and hide the ones that 404. Safe to run anytime; safe to re-run.
//
//   npm run verify:urls

import { dbApi } from "../db.js";
import { verifyUrl } from "../sources/util.js";

const rows = dbApi.allUnhidden();
console.log(`verify-urls: checking ${rows.length} row${rows.length === 1 ? "" : "s"}…`);

const CONCURRENCY = 8;
const queue = [...rows];
let checked = 0;
let hidden = 0;

async function worker() {
  while (queue.length) {
    const row = queue.shift();
    const ok = await verifyUrl(row.url);
    checked++;
    if (!ok) {
      dbApi.hide(row.id);
      hidden++;
      console.log(`  hid ${row.url}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`verify-urls: checked ${checked}, hid ${hidden} dead link${hidden === 1 ? "" : "s"}`);
process.exit(0);
