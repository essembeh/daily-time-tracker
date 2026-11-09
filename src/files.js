import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** "~/x" -> "$HOME/x"; anything else is returned as is. */
export function expandHome(path) {
    return path.startsWith('~/')
        ? GLib.build_filenamev([GLib.get_home_dir(), path.slice(2)])
        : path;
}

/** Creates the parent folder of `file` if needed; any other failure throws. */
export function ensureParentDir(file) {
    try {
        file.get_parent()?.make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
}

/** Temp file + rename: a shell killed mid-write leaves the previous file intact. */
export function writeText(file, text) {
    file.replace_contents(new TextEncoder().encode(text), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}
