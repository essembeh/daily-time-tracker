import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {daysInMonth} from './dates.js';
import {formatHours, round2} from './hours.js';

/**
 * Every day of the month, zeros included, plus a TOTAL line — an invoice is easier to
 * re-read with the days off visible.
 *
 * The header stays in English on purpose: the file is read by spreadsheets and
 * scripts, its columns must not change with the locale. Day names do follow it.
 */
export function buildMonthCsv(storage, year, month) {
    const lines = ['date,day,hours'];
    let total = 0;

    for (let day = 1; day <= daysInMonth(year, month); day++) {
        const date = GLib.DateTime.new_local(year, month, day, 0, 0, 0);
        const key = date.format('%Y-%m-%d');
        const hours = storage.get(key);
        total += hours;
        lines.push(`${key},${date.format('%A')},${formatHours(hours)}`);
    }
    total = round2(total);
    lines.push(`TOTAL,,${formatHours(total)}`);

    return {content: `${lines.join('\n')}\n`, total};
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
        return configured.startsWith('~/')
            ? GLib.build_filenamev([GLib.get_home_dir(), configured.slice(2)])
            : configured;
    return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS) ??
        GLib.get_home_dir();
}

export function writeCsv(file, content) {
    try {
        file.get_parent()?.make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    file.replace_contents(new TextEncoder().encode(content), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}
