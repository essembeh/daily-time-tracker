#!/usr/bin/env node
// Enforces the markdown convention of CLAUDE.md: in a table, every row of a given
// block must be the same width IN CHARACTERS (not bytes).
import {readFileSync, readdirSync} from 'node:fs';

const FILES = ['README.md', 'CLAUDE.md', ...readdirSync('docs/specs').map(f => `docs/specs/${f}`)];

let failed = 0;
for (const file of FILES) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let block = [];
    const flush = () => {
        if (block.length > 1) {
            const widths = new Set(block.map(([, l]) => [...l].length));
            if (widths.size > 1) {
                failed++;
                console.log(`FAIL ${file}: table at line ${block[0][0]} has widths ` +
                    `${[...widths].join(', ')}`);
            }
        }
        block = [];
    };
    lines.forEach((line, index) => {
        if (line.startsWith('|'))
            block.push([index + 1, line]);
        else
            flush();
    });
    flush();
}
console.log(failed ? `${failed} misaligned table(s)` : 'markdown tables aligned');
process.exit(failed ? 1 : 0);
