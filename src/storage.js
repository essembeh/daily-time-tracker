import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {clampHours, round2} from './hours.js';

const DATA_VERSION = 1;
const WRITE_DEBOUNCE_MS = 500;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The hours, as a plain JSON file:
 *
 *     { "version": 1, "days": { "2026-09-12": 7.5 } }
 *
 * Days at 0 are not stored (absence means 0). This file is the billing evidence:
 * writes are atomic and debounced, and a file we failed to parse is NEVER
 * overwritten — it is copied aside first, and writing stays blocked if even that
 * copy fails.
 */
export class Storage {
    constructor(path) {
        this._file = Gio.File.new_for_path(path);
        this._days = new Map();
        this._writeSourceId = 0;
        this._blocked = false;
        this._load();
    }

    static defaultPath() {
        return GLib.build_filenamev(
            [GLib.get_user_data_dir(), 'daily-time-tracker', 'data.json']);
    }

    static resolvePath(configured) {
        if (!configured)
            return Storage.defaultPath();
        if (configured.startsWith('~/'))
            return GLib.build_filenamev([GLib.get_home_dir(), configured.slice(2)]);
        return configured;
    }

    get path() {
        return this._file.get_path();
    }

    get(key) {
        return this._days.get(key) ?? 0;
    }

    set(key, hours) {
        const value = clampHours(hours);
        if (value > 0)
            this._days.set(key, value);
        else
            this._days.delete(key);
        this._scheduleSave();
    }

    monthTotal(year, month) {
        const prefix = `${year}-${String(month).padStart(2, '0')}-`;
        let total = 0;
        for (const [key, hours] of this._days) {
            if (key.startsWith(prefix))
                total += hours;
        }
        return round2(total);
    }

    flush() {
        if (!this._writeSourceId)
            return;
        GLib.Source.remove(this._writeSourceId);
        this._writeSourceId = 0;
        this._save();
    }

    destroy() {
        this.flush();
        this._days.clear();
    }

    _load() {
        let contents;
        try {
            const [, bytes] = this._file.load_contents(null);
            contents = new TextDecoder().decode(bytes);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`daily-time-tracker: cannot read ${this.path}: ${e}`);
            return;
        }

        try {
            const data = JSON.parse(contents);
            for (const [key, value] of Object.entries(data.days ?? {})) {
                const hours = clampHours(Number(value));
                if (DAY_KEY_RE.test(key) && Number.isFinite(hours) && hours > 0)
                    this._days.set(key, hours);
            }
        } catch (e) {
            this._days.clear();
            this._quarantine(contents, e);
        }
    }

    /** Keeps an untouched copy of a file we could not parse, then starts empty. */
    _quarantine(contents, error) {
        const stamp = GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S');
        const backup = Gio.File.new_for_path(`${this.path}.corrupt-${stamp}`);
        try {
            backup.replace_contents(new TextEncoder().encode(contents), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            console.warn('daily-time-tracker: unreadable data file ' +
                `(${error.message}), copy kept in ${backup.get_path()}`);
        } catch (e) {
            // Could not save the copy: refuse to write at all rather than destroy it.
            this._blocked = true;
            console.error('daily-time-tracker: unreadable data file and backup ' +
                `failed (${e.message}), saving is disabled`);
        }
    }

    _scheduleSave() {
        if (this._writeSourceId)
            GLib.Source.remove(this._writeSourceId);
        this._writeSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, WRITE_DEBOUNCE_MS, () => {
                this._writeSourceId = 0;
                this._save();
                return GLib.SOURCE_REMOVE;
            });
    }

    _serialize() {
        const days = {};
        for (const key of [...this._days.keys()].sort())
            days[key] = this._days.get(key);
        return `${JSON.stringify({version: DATA_VERSION, days}, null, 2)}\n`;
    }

    _save() {
        if (this._blocked)
            return;
        try {
            this._file.get_parent()?.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                console.error(`daily-time-tracker: cannot create data directory: ${e}`);
                return;
            }
        }
        try {
            // REPLACE_DESTINATION is the temp-file + rename we want: a shell killed
            // mid-write leaves the previous file intact.
            this._file.replace_contents(
                new TextEncoder().encode(this._serialize()), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.error(`daily-time-tracker: cannot write ${this.path}: ${e}`);
        }
    }
}
