// Every source module exports:
//   export const meta = { id, label, feedUrl? }
//   export async function fetchItems(): Promise<OpeningRow[]>
//
// Add a new source by dropping a file in this folder and importing it here.

import * as eater from "./eater.js";
// Block Club is temporarily disabled — noisy output outweighed useful hits.
// The blockclub.js module is preserved unchanged; re-add to the array below
// (and re-import) when we come back to it.
// import * as blockclub from "./blockclub.js";
import * as infatuation from "./infatuation.js";
import * as suntimes from "./suntimes.js";
import * as googlenews from "./googlenews.js";

export const sources = [eater, /* blockclub, */ infatuation, suntimes, googlenews];
