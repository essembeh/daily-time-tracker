# CLAUDE.md — Daily time tracker

`daily-time-tracker@essembeh.org` is a GNOME Shell extension to **manually log the
hours worked each day** and read the monthly total back. Manual, declarative entry —
**no timer, no start/stop, no activity detection** (see the spec).

GNOME **50** (NixOS stable), pure GJS/ESM, **no build step**. Shipped code lives in
`src/`, dev helpers in `tests/`.

**`docs/specs/features.md` is the source of truth.** Any behavior change must be
reflected there first.

**Languages.** Repo content is **English** — code, comments, commit messages, README,
this file, and the UI source strings passed to `gettext`. **The specs under
`docs/specs/` are the exception: they are written and iterated in French**, because
that is the language Seb designs in. Do not translate them, and keep writing them in
French when they change. Conversation with Seb is in French too.

## Relation to Minibar

This project follows the standards and philosophy of
[minibar](https://github.com/essembeh/minibar) — same author, same principles: strong
opinions, few settings, small code. **Read minibar before inventing anything here**:
repo layout, tooling, CI, markdown conventions and dev workflow are taken from it.

| File                          | Role                                         |
| ----------------------------- | -------------------------------------------- |
| `src/extension.js`            | entry point, `enable()` / `disable()`        |
| `src/indicator.js`            | panel icon + popup, all the UI               |
| `src/storage.js`              | the JSON data file, atomic and debounced     |
| `src/csvExport.js`            | builds the monthly CSV                       |
| `src/hours.js`                | **pure helpers, no `gi://` import**          |
| `src/dates.js`                | GLib date helpers                            |
| `src/prefs.js`                | Adw preferences, separate Gtk process        |
| `tests/unit.mjs`              | node tests over `hours.js`                   |
| `tests/check-markdown.mjs`    | table alignment enforced by CI               |
| `tests/nested.sh`             | nested shell running the working tree        |
| `.github/workflows/build.yml` | checks, then zip, then release on `v*` tag   |

**Keep `src/hours.js` free of `gi://` imports.** It is the only module node can
import, so everything testable without a shell belongs there — parsing, rounding,
formatting. A `gi://` import in it silently kills `tests/unit.mjs`.

## Project invariants

- **Manual entry only.** Any proposal that drifts toward a timer, idle detection or
  automatic capture is out of scope — say so instead of implementing it.
- **One flat data set**: no projects, no clients, no tags, no categories.
- **The data file is the billing evidence.** It is plain JSON under
  `$XDG_DATA_HOME/daily-time-tracker/data.json`, hand-editable and git-friendly.
  Writes are atomic (temp file + `rename`) and debounced. An unparseable file is
  **never** overwritten — back it up as `.corrupt-<timestamp>` and start empty.
- **GSettings holds preferences, never the hours.**
- Data are local, never sent anywhere; no network code in this extension.

## Markdown formatting

All `.md` files (README, specs, this file):

- **Tables are padded so the pipes line up** — pad every cell with spaces to the
  widest cell of its column, and make the separator row match that width:

  ```markdown
  | Key           | Type   | Default |
  | ------------- | ------ | ------- |
  | `step-hours`  | double | 0.5     |
  | `data-path`   | string | ""      |
  ```

  Count **characters, not bytes** (`·`, `—`, emojis are multi-byte). Check with
  `grep '^|' file.md | awk '{ print length($0) }' | sort -u` — a single value means
  the table is aligned.
- Wrap **prose** at ~88 columns. Tables, fenced code and long URLs are exempt —
  never break those to fit. Never reflow a paragraph that is not otherwise being
  edited.
- Fenced code blocks always carry a language tag (`bash`, `js`, `markdown`, `xml`).

## Feature requests: be critical (KISS guard)

When Seb asks for a new feature, do NOT just implement it:

1. **Assess the risk first**: complexity (LOC), reliance on private shell members or
   churn-prone GNOME APIs, fight against shell assumptions.
2. **If the feature carries such a risk, say so BEFORE implementing** and propose a
   compromise (smaller scope, different mechanism, or not doing it). Seb explicitly
   wants push-back, not compliance.
3. **Check how others did it first** when the feature is not trivial — other time
   tracking / calendar extensions, and minibar for shell-side patterns.

## Environment (NixOS)

- No dev tools in PATH (`node`, `glib-compile-schemas`, `gjs`… are all absent). Get
  them through `nix-shell -p <pkg> --run '<cmd>'` — **never** hardcode or hunt for
  `/nix/store/...` paths (they break on every GC / channel update):
  - syntax check (ESM, so read from stdin — `node --check file.js` parses as CJS and
    chokes on `import`):
    `nix-shell -p nodejs-slim --run 'for f in src/*.js; do node --input-type=module --check < $f || echo $f; done'`
  - after ANY gschema change:
    `nix-shell -p glib --run 'glib-compile-schemas src/schemas/'`
- `nix-shell -p` may fetch from the network into Seb's store: **ask him before the
  first use of a package** in a session.
- Run what the CI runs, before saying a change is ready:
  `nix-shell -p nodejs-slim --run 'node tests/unit.mjs && node tests/check-markdown.mjs'`

## Dev workflow

- Iteration happens in a nested GNOME Shell: `./tests/nested.sh` (devkit; `--nested`
  was removed in 49; dconf isolated via throwaway `XDG_CONFIG_HOME` — do NOT use
  `DCONF_PROFILE`, it hangs gnome-shell before any log).
- **Never launch `tests/nested.sh` yourself — ask Seb to run it** (two instances
  collide). To debug, ask him to pipe it:
  `./tests/nested.sh 2>&1 | tee <scratchpad>/nested.log`.
- ⚠️ The nested script sets a throwaway `XDG_DATA_HOME` — which is also where the
  **data file** lives. The nested therefore starts with an empty data set, and hours
  entered there do not touch the real file. That isolation is wanted; just never
  conclude "the data are lost" from a nested run.
- Reload rules after a change:
  - extension JS → kill + relaunch the nested (ESM modules load once per process)
  - `stylesheet.css` → disable/enable the extension (Extensions app in the nested)
  - `prefs.js` → just reopen the prefs window (separate process)
  - gschema → recompile, then kill + relaunch
- A symlink to the extension must point at `src/`, not at the repo root — otherwise
  the shell finds no `metadata.json`/`schemas/` and the extension stays in `ERROR`.

## GNOME 49/50 API gotchas (inherited from minibar, learned the hard way)

- `Clutter.ClickAction` is dead (49+): use `Clutter.ClickGesture` + `recognize`
  signal, button read via `gesture.get_button()` (0 = touch).
- `GLib.idle_add_once(priority, callback)` — the priority argument is REQUIRED;
  with one argument the callback silently never runs correctly.
- Clutter alignment (`x_align`/`y_align`) is only honored when the matching
  `x_expand`/`y_expand` is true (otherwise BinLayout centers the child).
- Accent color: `global.stage.get_accent_color()` (47+), values 0-255.
- Every `GLib` timeout / `Gio` monitor / signal connected in `enable()` must be
  released in `disable()` — a leaked source keeps the extension alive after unload
  and is the classic cause of an EGO review rejection.
- Dates and day/month names come from `GLib.DateTime.format` with the current
  locale — never a hardcoded array of day names.
- St's CSS is a small subset of CSS: `opacity` and `border-left` work, **`text-transform`
  does not** — capitalize in JS instead (`%A` yields "samedi" in French).
- `reactive = false` does NOT give a widget the theme's disabled look: pair it with
  `add_style_pseudo_class('insensitive')`, like `PopupMenuItem.setSensitive()` does.
- **`Gtk` is unusable in the shell process.** Anything needing a real dialog belongs
  in `prefs.js`, which IS a normal Gtk process (`Gtk.FileDialog` and friends work
  there). Reaching for the XDG portal over D-Bus from the shell is the escape hatch,
  and it was already judged too heavy once — see the export folder decision in §5 of
  the spec before proposing it again.
- **`tests/nested.sh` runs under `dbus-run-session`, i.e. its OWN session bus.**
  Anything relying on session services (portals, D-Bus-activated daemons) does not
  behave there as in the real session: services get re-activated as second instances
  and their windows open on the HOST display, not inside the nested. A feature that
  "does nothing" in the nested may be perfectly fine in a real session — and vice
  versa. Do not conclude either way from a nested run alone.

## Git

Seb handles his own commits (see the global rules): Claude **never** runs
`git commit` or `git push`. When a change is ready, say so and suggest a commit
message — gitmoji + English, like minibar's history (`✨`, `🐛`, `📝`, `🔖`).
