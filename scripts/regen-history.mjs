#!/usr/bin/env node
// Regenerate public/data/sim-model-history.json from the cached CSV and the
// existing public/data files, without touching the network. update.mjs does the
// same thing as part of a full run; this is the fast path for iterating on it.
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildHistory } from './simhistory.mjs'

const OUT = path.join(import.meta.dirname, '..', 'public', 'data')
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'))

const csv = await fs.readFile(path.join(import.meta.dirname, 'cache', 'intl-results.csv'), 'utf8')
const { matches } = await read(path.join(OUT, 'matches.json'))
const { venues } = await read(path.join(OUT, 'venues.json'))
const simModel = await read(path.join(OUT, 'sim-model.json'))
const f = Object.fromEntries(Object.entries(simModel.teams).map(([c, v]) => [c, v.f]))

const history = buildHistory(csv, matches, venues, f)
// byte-for-byte identical to update.mjs's writeJson, so alternating between the two
// paths never produces a spurious diff on a committed data file
await fs.writeFile(path.join(OUT, 'sim-model-history.json'), `${JSON.stringify(history, null, 1)}\n`)
console.log(`sim-model-history.json: ${history.cuts.length} cuts`)
