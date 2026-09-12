#!/usr/bin/env node
// Unit tests for the gi-free helpers of src/hours.js.
// Run: nix-shell -p nodejs-slim --run 'node tests/unit.mjs'
import {clampHours, capitalize, formatHours, parseHours, parseTimeOfDay, round2}
    from '../src/hours.js';

const CASES = [
    ['parse "7.5"', parseHours('7.5'), 7.5],
    ['parse "7,5"', parseHours('7,5'), 7.5],
    ['parse "7h30"', parseHours('7h30'), 7.5],
    ['parse "7h"', parseHours('7h'), 7],
    ['parse "7.5h"', parseHours('7.5h'), 7.5],
    ['parse "0"', parseHours('0'), 0],
    ['parse blank', parseHours('   '), null],
    ['parse "abc"', parseHours('abc'), null],
    ['parse "7h5x"', parseHours('7h5x'), null],

    ['clamp 7.4 to grain', clampHours(7.4), 7.5],
    ['clamp 7.6 to grain', clampHours(7.6), 7.5],
    ['clamp negative', clampHours(-3), 0],
    ['clamp above 24', clampHours(99), 24],
    ['clamp "7h20"', clampHours(parseHours('7h20')), 7.25],

    ['format 8', formatHours(8), '8'],
    ['format 7.5', formatHours(7.5), '7.5'],
    ['format 7.25', formatHours(7.25), '7.25'],

    ['round2 float drift', round2(7.5 + 0.1 + 0.2), 7.8],
    ['capitalize', capitalize('samedi'), 'Samedi'],
    ['capitalize empty', capitalize(''), ''],

    ['time "18:00"', String(parseTimeOfDay('18:00')), '18,0'],
    ['time "9:05"', String(parseTimeOfDay('9:05')), '9,5'],
    ['time "23:59"', String(parseTimeOfDay('23:59')), '23,59'],
    ['time "24:00"', parseTimeOfDay('24:00'), null],
    ['time "18:60"', parseTimeOfDay('18:60'), null],
    ['time "18h00"', parseTimeOfDay('18h00'), null],
];

let failed = 0;
for (const [name, got, want] of CASES) {
    const ok = got === want;
    if (!ok)
        failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got} (want ${want})`);
}
console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed ? 1 : 0);
