import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {buildMonthCsv, defaultFileName, resolveExportDir, writeCsv} from './csvExport.js';
import {Storage} from './storage.js';
import {dayKey, dayTag, isWeekend, monthTag, startOfDay, startOfWeek, today}
    from './dates.js';
import {GRAIN_HOURS, MAX_HOURS, capitalize, clampHours, formatHours, parseHours,
    parseTimeOfDay} from './hours.js';

/** One calendar week per screen, starting on the locale's first day. */
const DAYS = 7;
/** Smooth (touchpad) scroll only steps once this much delta has accumulated. */
const SCROLL_THRESHOLD = 1.0;
const DEFAULT_REMINDER = [18, 0];

/** Reuses the shell theme's own disabled look instead of inventing one. */
function setEnabled(button, enabled) {
    button.reactive = enabled;
    button.can_focus = enabled;
    if (enabled)
        button.remove_style_pseudo_class('insensitive');
    else
        button.add_style_pseudo_class('insensitive');
}

function setClass(actor, name, enabled) {
    if (enabled)
        actor.add_style_class_name(name);
    else
        actor.remove_style_class_name(name);
}

export const TimeTrackerIndicator = GObject.registerClass(
class TimeTrackerIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Daily time tracker');

        this._settings = extension.getSettings();
        // Bound rather than keeping the extension itself: nothing else is needed
        // from it, and destroy() drops the reference in one place.
        this._openPreferences = () => extension.openPreferences();
        this._storage = new Storage(
            Storage.resolvePath(this._settings.get_string('data-path')));
        // First day of the displayed week.
        this._anchor = startOfWeek(today());
        this._columns = [];
        this._editing = null;
        this._scrollDelta = 0;
        this._midnightId = 0;
        this._reminderId = 0;
        this._source = null;

        // No counter in the top bar: the icon colour alone says whether today has
        // been logged — orange for nothing yet, green once it has.
        this._icon = new St.Icon({
            icon_name: 'preferences-system-time-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._buildMenu();

        this._settings.connectObject(
            'changed::step-hours', () => this._refresh(),
            'changed::max-hours', () => this._refresh(),
            'changed::show-weekends', () => this._onShowWeekendsChanged(),
            'changed::data-path', () => this._reloadStorage(),
            'changed::reminder-enabled', () => this._rescheduleReminder(),
            'changed::reminder-time', () => this._rescheduleReminder(),
            this);

        this.menu.connectObject('open-state-changed', (_menu, isOpen) => {
            this._cancelEdit();
            if (isOpen) {
                // Every opening starts on the current week, whatever was browsed
                // last time; the shell may also have been open across midnight.
                this._anchor = startOfWeek(today());
                this._refresh();
            }
        }, this);

        this._scheduleMidnight();
        this._rescheduleReminder();
        this._refresh();
    }

    destroy() {
        for (const id of [this._midnightId, this._reminderId]) {
            if (id)
                GLib.Source.remove(id);
        }
        this._midnightId = 0;
        this._reminderId = 0;
        this._openPreferences = null;
        this._settings?.disconnectObject(this);
        this.menu?.disconnectObject(this);
        this._storage?.destroy();
        this._storage = null;
        this._source?.destroy();
        this._source = null;
        super.destroy();
    }

    // -- building ----------------------------------------------------------

    _buildMenu() {
        const header = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._prevButton = this._navButton(
            'go-previous-symbolic', () => this._shiftWindow(-DAYS));
        this._nextButton = this._navButton(
            'go-next-symbolic', () => this._shiftWindow(DAYS));
        this._headerLabel = new St.Label({
            style_class: 'dtt-header',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._todayButton = new St.Button({
            label: _('Today'),
            style_class: 'dtt-header-today button',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._todayButton.connect('clicked', () => this._goToday());
        header.add_child(this._prevButton);
        header.add_child(this._headerLabel);
        header.add_child(this._nextButton);
        header.add_child(this._todayButton);
        this.menu.addMenuItem(header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const grid = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const gridBox = new St.BoxLayout({style_class: 'dtt-grid', x_expand: true});
        for (let index = 0; index < DAYS; index++) {
            const column = this._buildColumn(index);
            this._columns.push(column);
            gridBox.add_child(column.actor);
        }
        grid.add_child(gridBox);
        this.menu.addMenuItem(grid);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const month = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._monthLabel = new St.Label({
            style_class: 'dtt-month',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._monthTotalLabel = new St.Label({
            style_class: 'dtt-month-total',
            y_align: Clutter.ActorAlign.CENTER,
        });
        month.add_child(this._monthLabel);
        month.add_child(this._monthTotalLabel);
        this.menu.addMenuItem(month);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const actions = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const exportButton = new St.Button({
            label: _('Export CSV'),
            style_class: 'dtt-action button',
            x_expand: true,
        });
        exportButton.connect('clicked', () => this._exportCsv());
        const prefsButton = new St.Button({
            style_class: 'dtt-action-icon button',
            child: new St.Icon({
                icon_name: 'emblem-system-symbolic',
                style_class: 'popup-menu-icon',
            }),
        });
        prefsButton.connect('clicked', () => {
            this.menu.close();
            this._openPreferences();
        });
        actions.add_child(exportButton);
        actions.add_child(prefsButton);
        this.menu.addMenuItem(actions);
    }

    _navButton(iconName, callback) {
        const button = new St.Button({
            style_class: 'dtt-nav button',
            child: new St.Icon({icon_name: iconName, style_class: 'popup-menu-icon'}),
        });
        button.connect('clicked', callback);
        return button;
    }

    _buildColumn(index) {
        const actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'dtt-column',
            x_expand: true,
            reactive: true,
        });
        const column = {
            index,
            actor,
            key: null,
            // Always present, empty on days that do not start a month: keeps every
            // column the same height whatever the window shows.
            month: new St.Label({
                style_class: 'dtt-month-tag',
                x_align: Clutter.ActorAlign.CENTER,
            }),
            name: new St.Label({
                style_class: 'dtt-day-name',
                x_align: Clutter.ActorAlign.CENTER,
            }),
            number: new St.Label({
                style_class: 'dtt-day-number',
                x_align: Clutter.ActorAlign.CENTER,
            }),
            plus: new St.Button({label: '+', style_class: 'dtt-step button'}),
            minus: new St.Button({label: '−', style_class: 'dtt-step button'}),
            value: new St.Button({style_class: 'dtt-value button'}),
            entry: new St.Entry({
                style_class: 'dtt-entry',
                can_focus: true,
                visible: false,
            }),
        };

        column.plus.connect('clicked', () => this._step(column, +1));
        column.minus.connect('clicked', () => this._step(column, -1));
        column.value.connect('clicked', () => this._startEdit(column));
        actor.connect('scroll-event', (_actor, event) => this._onScroll(column, event));

        column.entry.clutter_text.connect('activate', () => this._commitEdit(column));
        column.entry.clutter_text.connect('key-focus-out', () => this._cancelEdit());
        column.entry.clutter_text.connect('key-press-event', (_text, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._cancelEdit();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        actor.add_child(column.month);
        actor.add_child(column.name);
        actor.add_child(column.number);
        actor.add_child(column.plus);
        actor.add_child(column.value);
        actor.add_child(column.entry);
        actor.add_child(column.minus);
        return column;
    }

    // -- state -------------------------------------------------------------

    _dateForColumn(index) {
        return this._anchor.add_days(index);
    }

    _maxHours() {
        return Math.min(MAX_HOURS,
            Math.max(GRAIN_HOURS, this._settings.get_double('max-hours')));
    }

    _refresh() {
        const todayKey = dayKey(today());
        const max = this._maxHours();

        // The month shown in the total is the one the week ENDS in, so it matches the
        // right edge of the grid; days of any other month are dimmed. Resolved in a
        // first pass because hiding weekends can move that last day.
        const showWeekends = this._settings.get_boolean('show-weekends');
        const visibleDates = [];
        for (let index = 0; index < DAYS; index++) {
            const date = this._dateForColumn(index);
            if (showWeekends || !isWeekend(date))
                visibleDates.push(date);
        }
        const last = visibleDates[visibleDates.length - 1] ?? this._anchor;
        const month = last.get_month();

        this._headerLabel.text = this._weekLabel(visibleDates);

        let previousMonth = null;
        let isFirstVisible = true;
        for (const column of this._columns) {
            const date = this._dateForColumn(column.index);
            const key = dayKey(date);
            const hours = this._storage.get(key);

            column.actor.visible = showWeekends || !isWeekend(date);
            if (!column.actor.visible)
                continue;

            // A month boundary inside the window has to be obvious, not just dimmed:
            // the first day of each month carries its name and opens a new group.
            const startsMonth = date.get_month() !== previousMonth;
            previousMonth = date.get_month();

            column.key = key;
            column.month.text = startsMonth ? monthTag(date) : '';
            column.name.text = dayTag(date);
            column.number.text = date.format('%d');
            column.value.label = `${formatHours(hours)} h`;

            setClass(column.actor, 'dtt-today', key === todayKey);
            setClass(column.actor, 'dtt-other-month', date.get_month() !== month);
            // Future days are dimmed but stay editable: logging Friday on Wednesday
            // is planning, not cheating.
            setClass(column.actor, 'dtt-future', key > todayKey);
            setClass(column.actor, 'dtt-month-start',
                startsMonth && !isFirstVisible);
            isFirstVisible = false;

            setEnabled(column.plus, hours < max);
            setEnabled(column.minus, hours > 0);
        }

        this._monthLabel.text = capitalize(last.format('%B %Y'));
        this._monthTotalLabel.text =
            `${formatHours(this._storage.monthTotal(last.get_year(), month))} h`;

        // Navigation is unbounded in both directions now that the future is
        // editable; only "Today" knows whether it has anything to do.
        const onCurrentWeek = dayKey(this._anchor) === dayKey(startOfWeek(today()));
        setEnabled(this._todayButton, !onCurrentWeek);

        this._refreshIcon();
    }

    _refreshIcon() {
        const now = today();
        // A hidden weekend is not a day to fill in: neither orange nor green, the
        // icon simply keeps the panel colour rather than nagging about a day off.
        const tracked = this._settings.get_boolean('show-weekends') || !isWeekend(now);
        const logged = this._storage.get(dayKey(now)) > 0;
        setClass(this._icon, 'dtt-icon-logged', tracked && logged);
        setClass(this._icon, 'dtt-icon-empty', tracked && !logged);
    }

    /** "7 – 13 septembre 2026", or "28 septembre – 4 octobre 2026" across a boundary. */
    _weekLabel(dates) {
        const start = dates[0] ?? this._anchor;
        const end = dates[dates.length - 1] ?? this._anchor;
        // %e is space padded; GLib has no portable "no padding" flag.
        const clean = text => text.replace(/\s+/g, ' ').trim();

        if (start.get_year() !== end.get_year())
            return `${clean(start.format('%e %B %Y'))} – ${clean(end.format('%e %B %Y'))}`;
        if (start.get_month() !== end.get_month())
            return `${clean(start.format('%e %B'))} – ${clean(end.format('%e %B %Y'))}`;
        return `${clean(start.format('%e'))} – ${clean(end.format('%e %B %Y'))}`;
    }

    _onShowWeekendsChanged() {
        this._cancelEdit();
        this._refresh();
    }

    // -- actions -----------------------------------------------------------

    _step(column, sign) {
        const step = this._settings.get_double('step-hours');
        this._setHours(column, this._storage.get(column.key) + sign * step);
    }

    _setHours(column, hours) {
        this._storage.set(column.key, Math.min(this._maxHours(), clampHours(hours)));
        this._refresh();
    }

    _onScroll(column, event) {
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            this._step(column, +1);
            return Clutter.EVENT_STOP;
        case Clutter.ScrollDirection.DOWN:
            this._step(column, -1);
            return Clutter.EVENT_STOP;
        case Clutter.ScrollDirection.SMOOTH: {
            // A touchpad emits a stream of small deltas: accumulate so one gesture
            // does not fire a dozen steps.
            const [, dy] = event.get_scroll_delta();
            this._scrollDelta += dy;
            if (Math.abs(this._scrollDelta) < SCROLL_THRESHOLD)
                return Clutter.EVENT_STOP;
            this._step(column, this._scrollDelta < 0 ? +1 : -1);
            this._scrollDelta = 0;
            return Clutter.EVENT_STOP;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _startEdit(column) {
        this._cancelEdit();
        this._editing = column;
        column.entry.set_text(formatHours(this._storage.get(column.key)));
        column.value.hide();
        column.entry.show();
        column.entry.grab_key_focus();
        column.entry.clutter_text.set_selection(0, -1);
    }

    _cancelEdit() {
        const column = this._editing;
        this._editing = null;
        if (!column)
            return;
        column.entry.hide();
        column.value.show();
    }

    _commitEdit(column) {
        const hours = parseHours(column.entry.get_text());
        this._cancelEdit();
        if (hours === null)
            return; // Unparseable input keeps the previous value.
        this._setHours(column, hours);
    }

    _shiftWindow(days) {
        this._cancelEdit();
        this._anchor = this._anchor.add_days(days);
        this._refresh();
    }

    _goToday() {
        this._cancelEdit();
        this._anchor = startOfWeek(today());
        this._refresh();
    }

    // -- export ------------------------------------------------------------

    _exportCsv() {
        this._storage.flush();
        const year = this._anchor.get_year();
        const month = this._anchor.get_month();
        const {content, total} = buildMonthCsv(this._storage, year, month);
        const file = Gio.File.new_for_path(GLib.build_filenamev([
            resolveExportDir(this._settings.get_string('export-dir')),
            defaultFileName(year, month),
        ]));
        this.menu.close();

        try {
            writeCsv(file, content);
        } catch (e) {
            console.error(`daily-time-tracker: CSV export failed: ${e}`);
            this._notify(_('Export failed'), e.message);
            return;
        }
        this._notify(
            _('Export done'),
            `${formatHours(total)} h → ${file.get_path()}`,
            () => Gio.AppInfo.launch_default_for_uri(file.get_parent().get_uri(), null));
    }

    _reloadStorage() {
        this._storage.destroy();
        this._storage = new Storage(
            Storage.resolvePath(this._settings.get_string('data-path')));
        this._refresh();
    }

    // -- notifications -----------------------------------------------------

    _notify(title, body, onActivated = null) {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: _('Time Tracker'),
                iconName: 'preferences-system-time-symbolic',
            });
            this._source.connect('destroy', () => (this._source = null));
            Main.messageTray.add(this._source);
        }
        const notification = new MessageTray.Notification({
            source: this._source,
            title,
            body,
        });
        if (onActivated)
            notification.connect('activated', () => onActivated());
        this._source.addNotification(notification);
    }

    // -- timers ------------------------------------------------------------

    _scheduleMidnight() {
        const now = GLib.DateTime.new_now_local();
        const midnight = startOfDay(now).add_days(1);
        const seconds = Math.max(
            1, Math.ceil(midnight.difference(now) / GLib.TIME_SPAN_SECOND) + 1);

        this._midnightId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, seconds, () => {
                this._midnightId = 0;
                this._onMidnight();
                this._scheduleMidnight();
                return GLib.SOURCE_REMOVE;
            });
    }

    _onMidnight() {
        const now = today();
        // Follow into the new week only if the view was tracking the current one.
        if (dayKey(this._anchor) === dayKey(startOfWeek(now.add_days(-1))))
            this._anchor = startOfWeek(now);
        this._cancelEdit();
        this._refresh();
    }

    /**
     * Armed from the wall clock every time it fires, so the daily drift of a timeout
     * (and a suspended laptop) never accumulates: a missed reminder simply fires late.
     */
    _rescheduleReminder() {
        if (this._reminderId) {
            GLib.Source.remove(this._reminderId);
            this._reminderId = 0;
        }
        if (!this._settings.get_boolean('reminder-enabled'))
            return;

        const [hour, minute] =
            parseTimeOfDay(this._settings.get_string('reminder-time')) ?? DEFAULT_REMINDER;
        const now = GLib.DateTime.new_now_local();
        let next = GLib.DateTime.new_local(
            now.get_year(), now.get_month(), now.get_day_of_month(), hour, minute, 0);
        if (next.difference(now) <= 0)
            next = next.add_days(1);

        const seconds = Math.max(
            1, Math.ceil(next.difference(now) / GLib.TIME_SPAN_SECOND));
        this._reminderId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, seconds, () => {
                this._reminderId = 0;
                this._fireReminder();
                this._rescheduleReminder();
                return GLib.SOURCE_REMOVE;
            });
    }

    _fireReminder() {
        const now = today();
        // Nothing to log on a day that is not even displayed.
        if (!this._settings.get_boolean('show-weekends') && isWeekend(now))
            return;

        const hours = this._storage.get(dayKey(now));
        this._notify(
            _('Log your hours'),
            `${_('Today')}: ${formatHours(hours)} h`,
            () => this.menu.open());
    }
});
