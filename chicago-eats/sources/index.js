// Every source module exports:
//   export const meta = { id, label, feedUrl? }
//   export async function fetchItems(): Promise<OpeningRow[]>
//
// Add a new source by dropping a file in this folder and importing it here.

import * as eater from "./eater.js";
import * as blockclub from "./blockclub.js";
import * as reddit from "./reddit.js";
import * as infatuation from "./infatuation.js";

export const sources = [eater, blockclub, reddit, infatuation];
