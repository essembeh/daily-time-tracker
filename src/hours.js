/**
 * Pure helpers: no `gi://` import here, on purpose — this module runs under plain
 * node, which is what `tests/unit.mjs` and the CI exercise.
 */

/** Every stored value is a multiple of this, in hours. */
export const GRAIN_HOURS = 0.25;
/** Hard bound: a day cannot hold more than this, whatever the preference says. */
export const MAX_HOURS = 24;

export function clampHours(hours) {
    const rounded = Math.round(hours / GRAIN_HOURS) * GRAIN_HOURS;
    return Math.min(MAX_HOURS, Math.max(0, rounded));
}

/** 8 -> "8", 7.5 -> "7.5", 7.25 -> "7.25": trailing zeros only add noise. */
export function formatHours(hours) {
    return `${Number(hours.toFixed(2))}`;
}

/** Accepts "7.5", "7,5", "7h30", "7h". Returns null when nothing sensible is typed. */
export function parseHours(text) {
    const raw = text.trim().toLowerCase().replace(',', '.');
    if (raw === '')
        return null;

    const withMinutes = raw.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})?$/);
    if (withMinutes)
        return Number(withMinutes[1]) + (withMinutes[2] ? Number(withMinutes[2]) / 60 : 0);

    const plain = raw.match(/^\d+(?:\.\d+)?$/);
    return plain ? Number(raw) : null;
}

/** "18:00" -> [18, 0]. Returns null on anything else, callers pick their default. */
export function parseTimeOfDay(text) {
    const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match)
        return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59)
        return null;
    return [hour, minute];
}

/** Sums of floats drift (7.5 + 0.1 + ...): keep totals to the cent. */
export function round2(value) {
    return Math.round(value * 100) / 100;
}

/** St has no text-transform: locales like fr yield "samedi", we want "Samedi". */
export function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
