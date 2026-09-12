import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const STEPS = [0.5, 1, 2, 4];
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default class DailyTimeTrackerPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        const entryGroup = new Adw.PreferencesGroup({title: _('Entry')});
        page.add(entryGroup);

        const stepRow = new Adw.ComboRow({
            title: _('Step'),
            subtitle: _('Hours added or removed by one click'),
            model: Gtk.StringList.new(['0.5 h', '1 h', '2 h', '4 h']),
            selected: Math.max(0, STEPS.indexOf(settings.get_double('step-hours'))),
        });
        stepRow.connect('notify::selected',
            () => settings.set_double('step-hours', STEPS[stepRow.selected]));
        entryGroup.add(stepRow);

        const maxRow = new Adw.SpinRow({
            title: _('Maximum per day'),
            subtitle: _('The + button stops there, and a typed value is capped to it'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 24,
                step_increment: 1,
                page_increment: 1,
                value: settings.get_double('max-hours'),
            }),
            digits: 0,
        });
        maxRow.connect('notify::value',
            () => settings.set_double('max-hours', maxRow.value));
        entryGroup.add(maxRow);

        const weekendRow = new Adw.SwitchRow({
            title: _('Show weekends'),
            subtitle: _('Off also keeps the reminder silent on Saturdays and Sundays'),
            active: settings.get_boolean('show-weekends'),
        });
        weekendRow.connect('notify::active',
            () => settings.set_boolean('show-weekends', weekendRow.active));
        entryGroup.add(weekendRow);

        const reminderGroup = new Adw.PreferencesGroup({
            title: _('Reminder'),
            description: _('Off by default. Once on, a notification comes every day at ' +
                'the time below — clicking it opens the popup.'),
        });
        page.add(reminderGroup);

        const reminderRow = new Adw.SwitchRow({
            title: _('Daily reminder'),
            active: settings.get_boolean('reminder-enabled'),
        });
        reminderRow.connect('notify::active',
            () => settings.set_boolean('reminder-enabled', reminderRow.active));
        reminderGroup.add(reminderRow);

        const timeRow = new Adw.EntryRow({
            title: _('Time (HH:MM)'),
            text: settings.get_string('reminder-time'),
            show_apply_button: true,
        });
        timeRow.connect('apply', () => {
            if (TIME_RE.test(timeRow.text.trim())) {
                timeRow.remove_css_class('error');
                settings.set_string('reminder-time', timeRow.text.trim());
            } else {
                // Keep the typo visible instead of silently reverting it.
                timeRow.add_css_class('error');
            }
        });
        settings.bind('reminder-enabled', timeRow, 'sensitive',
            Gio.SettingsBindFlags.GET);
        reminderGroup.add(timeRow);

        const exportGroup = new Adw.PreferencesGroup({
            title: _('Export'),
            description: _('The CSV export writes "YYYY-MM Daily time tracker.csv" ' +
                'into this folder, in one click — no dialog every month.'),
        });
        page.add(exportGroup);

        const exportRow = new Adw.ActionRow({
            title: _('Export folder'),
            subtitle: settings.get_string('export-dir') || _('Documents (default)'),
            activatable: true,
        });
        exportRow.add_suffix(new Gtk.Image({icon_name: 'folder-open-symbolic'}));
        exportRow.connect('activated', () => {
            // prefs.js is a normal Gtk process: the real file dialog lives here, not
            // in the shell.
            new Gtk.FileDialog({title: _('Export folder')})
                .select_folder(window, null, (dialog, result) => {
                    try {
                        const folder = dialog.select_folder_finish(result);
                        settings.set_string('export-dir', folder.get_path());
                    } catch {
                        // Dismissed: leave the current folder alone.
                    }
                });
        });
        exportGroup.add(exportRow);

        const exportResetRow = new Adw.ActionRow({
            title: _('Use the default folder'),
            subtitle: _('Documents'),
            activatable: true,
        });
        exportResetRow.connect('activated', () => settings.set_string('export-dir', ''));
        exportGroup.add(exportResetRow);

        settings.connect('changed::export-dir', () => {
            exportRow.subtitle =
                settings.get_string('export-dir') || _('Documents (default)');
        });

        const dataGroup = new Adw.PreferencesGroup({
            title: _('Data'),
            description: _('Plain JSON, one line per day worked — editable by hand, ' +
                'versionable, and never leaving this machine.'),
        });
        page.add(dataGroup);

        const pathRow = new Adw.EntryRow({
            title: _('Data file'),
            text: settings.get_string('data-path'),
            show_apply_button: true,
        });
        pathRow.connect('apply', () => settings.set_string('data-path', pathRow.text));
        dataGroup.add(pathRow);

        const resetRow = new Adw.ActionRow({
            title: _('Use the default location'),
            subtitle: '~/.local/share/daily-time-tracker/data.json',
            activatable: true,
        });
        resetRow.connect('activated', () => {
            settings.set_string('data-path', '');
            pathRow.text = '';
        });
        dataGroup.add(resetRow);
    }
}
