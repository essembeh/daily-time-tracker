import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ensureParentDir, expandHome, writeText} from './files.js';
import {clampHours, round2} from './hours.js';
import {DEFAULT_PROJECT, parseData, serializeData} from './projects.js';

const WRITE_DEBOUNCE_MS = 500;

/**
 * The hours, as a plain JSON file (format in projects.js, spec §4.1). Projects are
 * addressed by their position in the list.
 *
 * This file is the billing evidence: writes are atomic and debounced, and a file we
 * failed to parse is NEVER overwritten — it is copied aside first, and writing stays
 * blocked if even that copy fails. A v1 file is copied to `.v1` before the first v2
 * write, with the same rule.
 */
export class Storage {
    constructor(path) {
        this._file = Gio.File.new_for_path(path);
        this._projects = [{name: DEFAULT_PROJECT, days: new Map()}];
        // Original v1 contents, kept until they are safely copied aside.
        this._v1Contents = null;
        this._writeSourceId = 0;
        this._blocked = false;
        this._load();
    }

    static defaultPath() {
        return GLib.build_filenamev(
            [GLib.get_user_data_dir(), 'daily-time-tracker', 'data.json']);
    }

    static resolvePath(configured) {
        return configured ? expandHome(configured) : Storage.defaultPath();
    }

    get path() {
        return this._file.get_path();
    }

    /** Read-only view for the CSV export: `[{name, days: Map}]`, do not mutate. */
    get projects() {
        return this._projects;
    }

    get names() {
        return this._projects.map(project => project.name);
    }

    get count() {
        return this._projects.length;
    }

    get(index, key) {
        return this._projects[index]?.days.get(key) ?? 0;
    }

    set(index, key, hours) {
        const project = this._projects[index];
        if (!project)
            return;
        const value = clampHours(hours);
        if (value > 0)
            project.days.set(key, value);
        else
            project.days.delete(key);
        this._scheduleSave();
    }

    /** Every project on that day: what the panel icon and the reminder look at. */
    dayTotal(key) {
        return round2(this._projects.reduce(
            (sum, project) => sum + (project.days.get(key) ?? 0), 0));
    }

    monthTotal(index, year, month) {
        const prefix = `${year}-${String(month).padStart(2, '0')}-`;
        let total = 0;
        for (const [key, hours] of this._projects[index]?.days ?? []) {
            if (key.startsWith(prefix))
                total += hours;
        }
        return round2(total);
    }

    /** Removing hours destroys billing evidence: only an empty project can go. */
    canRemove(index) {
        return this._projects.length > 1 && this._projects[index]?.days.size === 0;
    }

    addProject(name) {
        this._projects.push({name, days: new Map()});
        this._scheduleSave();
        return this._projects.length - 1;
    }

    renameProject(index, name) {
        if (!this._projects[index])
            return;
        this._projects[index].name = name;
        this._scheduleSave();
    }

    removeProject(index) {
        if (!this.canRemove(index))
            return false;
        this._projects.splice(index, 1);
        this._scheduleSave();
        return true;
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
        this._projects = [];
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
            const {version, projects} = parseData(contents);
            this._projects = projects;
            if (version === 1)
                this._v1Contents = contents;
        } catch (e) {
            this._quarantine(contents, e);
        }
    }

    /** Keeps an untouched copy of a file we could not parse, then starts empty. */
    _quarantine(contents, error) {
        const stamp = GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S');
        const backup = Gio.File.new_for_path(`${this.path}.corrupt-${stamp}`);
        try {
            writeText(backup, contents);
            console.warn('daily-time-tracker: unreadable data file ' +
                `(${error.message}), copy kept in ${backup.get_path()}`);
        } catch (e) {
            // Could not save the copy: refuse to write at all rather than destroy it.
            this._blocked = true;
            console.error('daily-time-tracker: unreadable data file and backup ' +
                `failed (${e.message}), saving is disabled`);
        }
    }

    /** Copies the v1 file aside once; an existing copy is never overwritten. */
    _backupV1() {
        if (this._v1Contents === null)
            return true;
        const backup = Gio.File.new_for_path(`${this.path}.v1`);
        try {
            const stream = backup.create(Gio.FileCreateFlags.NONE, null);
            stream.write_bytes(new GLib.Bytes(new TextEncoder().encode(this._v1Contents)),
                null);
            stream.close(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                this._blocked = true;
                console.error('daily-time-tracker: cannot back up the v1 data file ' +
                    `(${e.message}), saving is disabled`);
                return false;
            }
        }
        this._v1Contents = null;
        return true;
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

    _save() {
        if (this._blocked || !this._backupV1())
            return;
        try {
            ensureParentDir(this._file);
            writeText(this._file, serializeData(this._projects));
        } catch (e) {
            console.error(`daily-time-tracker: cannot write ${this.path}: ${e}`);
        }
    }
}
