// Debug tool: fetch each source's raw RSS feed and show every item, with
// a ✓/✗ and the exact reason the classifier kept or dropped it. Useful for
// deciding which opening/skip keywords to add to sources/util.js.
//
//   node scripts/peek-feed.js           # all sources
//   node scripts/peek-feed.js eater     # just one
//   node scripts/peek-feed.js suntimes  # etc.

import Parser from "rss-parser";
import { sources } from "../sources/index.js";
import { classifyItem, stripHtml, truncate } from "../sources/util.js";

const which = process.argv[2] || null;

const targets = which
  ? sources.filter((s) => s.meta.id === which)
  : sources;

if (!targets.length) {
  const names = sources.map((s) => s.meta.id).join(", ");
  console.error(`No source named "${which}". Options: ${names}`);
  process.exit(1);
}

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
  },
});

// ANSI helpers — dim colors, work fine in Terminal / iTerm.
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const green = (s) => c(32, s);
const red   = (s) => c(31, s);
const dim   = (s) => c(90, s);
const bold  = (s) => c(1, s);

let totalKept = 0;
let totalSeen = 0;

for (const mod of targets) {
  console.log(`\n${bold("=== " + mod.meta.label + " ===")}`);
  console.log(dim("    " + mod.meta.feedUrl));
  try {
    const feed = await parser.parseURL(mod.meta.feedUrl);
    const items = feed.items || [];
    let kept = 0;
    console.log(dim(`    ${items.length} raw items\n`));
    for (const item of items.slice(0, 40)) {
      const title = item.title || "(no title)";
      const summary = truncate(
        stripHtml(item.contentSnippet || item.content || ""), 120
      );
      const hay = `${title} ${summary}`;
      const verdict = classifyItem(hay);
      totalSeen++;
      if (verdict.kept) { kept++; totalKept++; }
      const mark = verdict.kept ? green("  ✓") : red("  ✗");
      console.log(`${mark} ${title}`);
      console.log(dim(`     → ${verdict.reason}`));
    }
    console.log(dim(`    kept ${kept} of ${items.length}`));
  } catch (err) {
    console.log(red(`    FAILED: ${err.message}`));
  }
}

console.log(bold(`\nTotal: ${totalKept} kept of ${totalSeen} seen`));
process.exit(0);
