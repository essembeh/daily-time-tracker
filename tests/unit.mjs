#!/usr/bin/env node
// Unit tests for the gi-free helpers of src/hours.js and src/projects.js.
// Run: nix-shell -p nodejs-slim --run 'node tests/unit.mjs'
import {clampHours, capitalize, formatHours, parseHours, parseTimeOfDay, round2}
    from '../src/hours.js';
import {buildCsv, csvField, parseData, serializeData, validateProjectName}
    from '../src/projects.js';

const throws = fn => {
    try {
        fn();
        return false;
    } catch {
        return true;
    }
};
const v1 = parseData('{"version": 1, "days": {"2026-09-01": 7.5, "bad": 3, "2026-09-02": 0}}');
const noVersion = parseData('{"days": {"2026-09-01": 8}}');
const v2 = parseData(JSON.stringify({
    version: 2,
    projects: [
        {name: 'Default', days: {'2026-09-01': 8, '2026-09-02': 4}},
        {name: 'Client, "A"', days: {'2026-09-02': 3.5}},
        {name: 'Idle', days: {'2026-10-01': 2}},
    ],
}));
const csv = buildCsv(
    [{key: '2026-09-01', name: 'mardi'}, {key: '2026-09-02', name: 'mercredi'}],
    v2.projects);
const emptyCsv = buildCsv([{key: '2026-09-01', name: 'mardi'}], v2.projects.slice(2));
const NAMES = ['Default', 'Client A'];
const dump = projects => JSON.stringify(projects.map(p => [p.name, [...p.days]]));

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

    ['v1 becomes Default', dump(v1.projects), '[["Default",[["2026-09-01",7.5]]]]'],
    ['v1 is reported as v1', v1.version, 1],
    ['no version is v1', noVersion.projects[0].days.get('2026-09-01'), 8],
    ['v2 keeps project order', v2.projects.map(p => p.name).join('|'),
        'Default|Client, "A"|Idle'],
    ['v2 empty list gives Default', parseData('{"version": 2}').projects[0].name, 'Default'],
    ['unknown version throws', throws(() => parseData('{"version": 3}')), true],
    ['nameless project throws',
        throws(() => parseData('{"version": 2, "projects": [{}]}')), true],
    ['non-list projects throws',
        throws(() => parseData('{"version": 2, "projects": {}}')), true],
    ['array root throws', throws(() => parseData('[]')), true],
    ['round trip', dump(parseData(serializeData(v2.projects)).projects), dump(v2.projects)],
    ['serialize is v2', JSON.parse(serializeData(v1.projects)).version, 2],

    ['name trimmed', validateProjectName('  Client B ', NAMES), 'Client B'],
    ['name empty', validateProjectName('   ', NAMES), null],
    ['name duplicate any case', validateProjectName('client a', NAMES), null],
    ['name rename to itself', validateProjectName('client a', NAMES, 1), 'client a'],
    ['name reserved total', validateProjectName('Total', NAMES), null],
    ['name reserved date', validateProjectName('DATE', NAMES), null],
    ['name reserved day', validateProjectName('day', NAMES), null],

    ['csv plain field', csvField('Default'), 'Default'],
    ['csv quoted field', csvField('Client, "A"'), '"Client, ""A"""'],
    ['csv content', csv.content, [
        'date,day,Default,"Client, ""A""",total',
        '2026-09-01,mardi,8,0,8',
        '2026-09-02,mercredi,4,3.5,7.5',
        'TOTAL,,12,3.5,15.5',
        '',
    ].join('\n')],
    ['csv skips idle project', csv.totals.map(t => t.name).join('|'), 'Default|Client, "A"'],
    ['csv total', csv.total, 15.5],
    ['csv no hours', emptyCsv.content, 'date,day,total\n2026-09-01,mardi,0\nTOTAL,,0\n'],
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
