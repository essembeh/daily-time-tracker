<div align="center">

# ⏱️ Daily time tracker

**Write down your hours. Nothing else.**

*No timer. No projects. No cloud. A GNOME Shell extension that does one thing.*

[![build](https://github.com/essembeh/daily-time-tracker/actions/workflows/build.yml/badge.svg)](https://github.com/essembeh/daily-time-tracker/actions/workflows/build.yml)
[![GNOME Shell 50](https://img.shields.io/badge/GNOME%20Shell-50-4A86CF?logo=gnome&logoColor=white)](https://release.gnome.org/)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

</div>

---

You bill by the hour. At the end of a half-day you know what you worked — you just
need somewhere to put it, and a total at the end of the month.

That is the whole extension.

```
                                    ┌──────────────────────────────────────────────┐
  ⏱ ← orange: today is empty        │  ‹   7 – 13 September 2026   ›  [ Today ]    │
  ⏱ ← green:  today is logged       ├──────────────────────────────────────────────┤
                                    │   Mon   Tue   Wed   Thu  [FRI]  Sat   Sun    │
                                    │   07    08    09    10    11    12    13     │
                                    │                                              │
                                    │  [ + ] [ + ] [ + ] [ + ] [ + ] [ + ] [ + ]   │
                                    │   8 h   7 h  7.5h   8 h   4 h   0 h   0 h    │
                                    │  [ − ] [ − ] [ − ] [ − ] [ − ] [ − ] [ − ]   │
                                    ├──────────────────────────────────────────────┤
                                    │  September 2026                     34.5 h   │
                                    ├──────────────────────────────────────────────┤
                                    │                    [ Export CSV ]   [ ⚙ ]    │
                                    └──────────────────────────────────────────────┘

                                      Sat and Sun are in the future here: dimmed,
                                      but editable like any other day.
```

## What it does

- 🟠 **A colour, not a counter.** The panel icon is orange while today is empty, green
  once it is logged — no number cluttering your top bar.
- 🗓️ **One calendar week per screen**, starting on your locale's first day (Monday in
  France, Sunday in the US). Future days are dimmed but fully editable — noting
  Friday on Wednesday is planning, not cheating.
- ➕ **Two clicks per day.** `+` / `−` by a step of 0.5, 1, 2 or 4 h, with a
  configurable daily cap. The mouse wheel over a column does the same.
- ⌨️ **Or just type it.** Click the value and write `7.5`, `7,5` or `7h30`; `Enter`
  confirms, `Esc` drops it.
- 📅 **The monthly total**, always in sight — and month boundaries are impossible to
  miss while navigating.
- 📄 **CSV export** of the displayed month in one click: every day included, a
  `TOTAL` line, and a folder you pick once in the settings. The notification opens it.
- 🔔 **An optional daily reminder**, off by default. Once on: one notification a day at
  your time, and clicking it opens the popup.
- 🙈 **Hide weekends** if you do not work them — the grid drops to five columns, the
  icon stops nagging on Saturdays, and the reminder stays quiet.
- ⚙️ **Settings one click away**, straight from the popup.

## What it deliberately does NOT do

No stopwatch, no start/stop, no idle detection. Entry is **declarative**: a timer
produces precise but wrong numbers (breaks, meetings away from the desk, the day you
forgot to stop it) and demands a discipline nobody keeps.

No projects, no clients, no tags, no hourly rate, no invoice generation. And
**nothing leaves the machine**: no sync, no cloud, no API, no network code at all.

See [the spec](docs/specs/features.md) — §0 (KISS) is the project's constitution.

## Your data is a text file

`~/.local/share/daily-time-tracker/data.json`:

```json
{
  "version": 1,
  "days": {
    "2026-09-11": 4,
    "2026-09-12": 7.5
  }
}
```

Readable, editable by hand, versionable in git. Days at `0` are simply absent.

This file is billing evidence, and it is treated as such: writes are **atomic**
(a shell killed mid-write leaves the previous file intact) and **debounced**, and a
file the extension cannot parse is **never overwritten** — it is copied to
`data.json.corrupt-<timestamp>` first, and if even that copy fails, saving disables
itself rather than destroy anything.

## Install

### From a release

```bash
curl -L -o /tmp/stt.zip \
  "https://github.com/essembeh/daily-time-tracker/releases/latest/download/daily-time-tracker@essembeh.org.shell-extension.zip"
gnome-extensions install --force /tmp/stt.zip
```

Log out and back in (Wayland gives no other way to load new extension code), then:

```bash
gnome-extensions enable daily-time-tracker@essembeh.org
```

### From source

```bash
git clone https://github.com/essembeh/daily-time-tracker.git
cd daily-time-tracker
glib-compile-schemas src/schemas/
ln -s "$PWD/src" ~/.local/share/gnome-shell/extensions/daily-time-tracker@essembeh.org
```

The symlink must point at `src/`, not at the repo root — otherwise the shell finds no
`metadata.json` and the extension stays in `ERROR`.

## Settings

| Setting         | Values                         | Default   |
| --------------- | ------------------------------ | --------- |
| Step            | 0.5 h · 1 h · 2 h · 4 h        | 0.5 h     |
| Maximum per day | 1 h … 24 h                     | 12 h      |
| Daily reminder  | on · off                       | off       |
| Reminder time   | HH:MM                          | 18:00     |
| Show weekends   | on · off                       | on        |
| Export folder   | any folder                     | Documents |
| Data file       | any path (empty = XDG default) | empty     |

## Hacking

```bash
./tests/nested.sh                                   # nested shell, runs src/
nix-shell -p nodejs-slim --run 'node tests/unit.mjs' # pure helpers
```

`tests/nested.sh` starts a nested GNOME Shell with only this extension, loaded from
`src/`, under a throwaway `XDG_CONFIG_HOME` and `XDG_DATA_HOME`: your session, your
other extensions and your real data file are untouched.

Everything the CI runs — syntax check, unit tests, markdown table alignment, schema
validation — is in [`.github/workflows/build.yml`](.github/workflows/build.yml) and
runs locally just as well.

## License

[GPL-3.0](LICENSE) — same as GNOME Shell itself.
