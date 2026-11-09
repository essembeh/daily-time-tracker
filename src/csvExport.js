import GLib from 'gi://GLib';

import {daysInMonth} from './dates.js';
import {expandHome} from './files.js';
import {buildCsv} from './projects.js';

/**
 * Every day of the month, zeros included, one column per project with hours, the
 * day total, and a TOTAL line — an invoice is easier to re-read with the days off
 * visible. Day names follow the locale; the format itself lives in projects.js.
 */
export function buildMonthCsv(storage, year, month) {
    const days = [];
    for (let day = 1; day <= daysInMonth(year, month); day++) {
        const date = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
        days.push({key: date.format('%Y-%m-%d'), name: date.format('%A')});
    }
    return buildCsv(days, storage.projects);
}

export function defaultFileName(year, month) {
    return `${year}-${String(month).padStart(2, '0')} Daily time tracker.csv`;
}

/**
 * Where the export lands. Choosing the folder is a preference, not a dialog on every
 * export: Gtk cannot run in the shell process, and asking the portal for a save dialog
 * cost more D-Bus plumbing than a once-a-month action is worth.
 */
export function resolveExportDir(configured) {
    if (configured)
        return expandHome(configured);
    return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS) ??
        GLib.get_home_dir();
}
