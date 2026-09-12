import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

/**
 * ISO key of a date, in LOCAL time: a working day is a local notion, and these keys
 * sort and compare lexicographically, which the whole extension relies on.
 */
export function dayKey(date) {
    return date.format('%Y-%m-%d');
}

/** Local midnight, so day arithmetic never drifts across DST changes. */
export function startOfDay(date) {
    return GLib.DateTime.new_local(
        date.get_year(), date.get_month(), date.get_day_of_month(), 0, 0, 0);
}

export function today() {
    return startOfDay(GLib.DateTime.new_now_local());
}

export function daysInMonth(year, month) {
    return GLib.DateTime.new_local(year, month, 1, 0, 0, 0)
        .add_months(1).add_days(-1).get_day_of_month();
}

/** GLib weeks start on Monday: 6 = Saturday, 7 = Sunday. */
export function isWeekend(date) {
    return date.get_day_of_week() >= 6;
}

/**
 * Short day name without its trailing dot ("sam." -> "Sam"): same width worry as
 * monthTag(), one character saved in a column that has none to spare.
 */
export function dayTag(date) {
    const name = date.format('%a').replace(/[.\s]/g, '');
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Three uppercase letters for a month. A column is ~50px wide and St clips instead of
 * ellipsizing, so a localised month name ("sept.", "octobre") cannot be trusted to
 * fit: bound it by construction.
 */
export function monthTag(date) {
    return date.format('%b').replace(/[.\s]/g, '').slice(0, 3).toUpperCase();
}

/**
 * First day of the week for the current locale: Monday in fr, Sunday in en_US. This
 * is what the shell's own calendar uses; fall back to Monday if it ever disappears.
 */
export function weekStartDay() {
    return Shell.util_get_week_start ? Shell.util_get_week_start() : 1;
}

/** Start of the calendar week containing `date`. */
export function startOfWeek(date) {
    // GLib numbers days 1 (Monday) to 7 (Sunday); Shell uses 0 (Sunday) to 6.
    const dayOfWeek = date.get_day_of_week() % 7;
    const offset = (dayOfWeek - weekStartDay() + 7) % 7;
    return startOfDay(date).add_days(-offset);
}
