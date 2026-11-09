/**
 * Pure project model helpers: no `gi://` import here, like hours.js — node imports
 * this module in `tests/unit.mjs`.
 */
import {clampHours, formatHours, round2} from './hours.js';

const DATA_VERSION = 2;
export const DEFAULT_PROJECT = 'Default';
/** Keeps the selector on one line of the popup; hand-edited files may hold more. */
export const MAX_PROJECTS = 4;
/** Fixed CSV headers: a project named like one would make a column ambiguous. */
const RESERVED_NAMES = ['date', 'day', 'total'];
/**
 * By position, never a setting. Four hues far apart (blue, yellow, purple, red), all
 * light enough for dark text, and clear of the panel icon's orange and green.
 */
const PALETTE = ['#62a0ea', '#f6d32d', '#c061cb', '#f66151'];

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function projectColor(index) {
    return PALETTE[index % PALETTE.length];
}

function parseDays(days) {
    const map = new Map();
    for (const [key, value] of Object.entries(days ?? {})) {
        const hours = clampHours(Number(value));
        if (DAY_KEY_RE.test(key) && Number.isFinite(hours) && hours > 0)
            map.set(key, hours);
    }
    return map;
}

/**
 * Reads v1 (`{days}`, version 1 or absent) and v2 (`{projects: [...]}`). Throws on
 * anything it cannot read losslessly, including an unknown future version.
 */
export function parseData(text) {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object' || Array.isArray(data))
        throw new Error('not a JSON object');

    const version = data.version ?? 1;
    if (version === 1)
        return {version, projects: [{name: DEFAULT_PROJECT, days: parseDays(data.days)}]};
    if (version !== DATA_VERSION)
        throw new Error(`unsupported data version ${JSON.stringify(version)}`);

    const list = data.projects ?? [];
    if (!Array.isArray(list))
        throw new Error('"projects" is not a list');
    const projects = list.map((project, index) => {
        if (typeof project?.name !== 'string' || !project.name.trim())
            throw new Error(`project #${index + 1} has no name`);
        return {name: project.name, days: parseDays(project.days)};
    });
    if (!projects.length)
        projects.push({name: DEFAULT_PROJECT, days: new Map()});
    return {version, projects};
}

export function serializeData(projects) {
    const list = projects.map(({name, days}) => {
        const sorted = {};
        for (const key of [...days.keys()].sort())
            sorted[key] = days.get(key);
        return {name, days: sorted};
    });
    return `${JSON.stringify({version: DATA_VERSION, projects: list}, null, 2)}\n`;
}

/** The trimmed name if usable, else null. `selfIndex` is the project being renamed. */
export function validateProjectName(raw, names, selfIndex = -1) {
    const name = raw.trim();
    const lower = name.toLowerCase();
    if (!name || RESERVED_NAMES.includes(lower))
        return null;
    if (names.some((other, index) => index !== selfIndex && other.toLowerCase() === lower))
        return null;
    return name;
}

/** RFC 4180: quote when needed, double the quotes. */
export function csvField(text) {
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * `days` is every day of the month as `{key, name}`. One column per project with
 * hours in the month, then the day total; a TOTAL line closes every column.
 */
export function buildCsv(days, projects) {
    const used = projects
        .map(project => ({
            name: project.name,
            days: project.days,
            total: round2(days.reduce((sum, {key}) => sum + (project.days.get(key) ?? 0), 0)),
        }))
        .filter(project => project.total > 0);

    const lines = [['date', 'day', ...used.map(p => p.name), 'total'].map(csvField).join(',')];
    let total = 0;
    for (const {key, name} of days) {
        const hours = used.map(p => p.days.get(key) ?? 0);
        const dayTotal = round2(hours.reduce((sum, h) => sum + h, 0));
        total += dayTotal;
        lines.push([key, csvField(name), ...hours.map(formatHours), formatHours(dayTotal)]
            .join(','));
    }
    total = round2(total);
    lines.push(['TOTAL', '', ...used.map(p => formatHours(p.total)), formatHours(total)]
        .join(','));

    return {
        content: `${lines.join('\n')}\n`,
        totals: used.map(({name, total: hours}) => ({name, hours})),
        total,
    };
}
