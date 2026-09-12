#!/usr/bin/env bash
# Run a nested GNOME Shell (devkit) with only this extension enabled, loaded from
# src/. Throwaway XDG_CONFIG_HOME and XDG_DATA_HOME keep the host session, its
# installed extensions and its home directory untouched.
#
# NOTE: the throwaway XDG_DATA_HOME also isolates the tracker data file
# ($XDG_DATA_HOME/daily-time-tracker/data.json): the nested always starts with an
# empty data set and never touches the real hours.
set -eu

UUID="daily-time-tracker@essembeh.org"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export XDG_CONFIG_HOME="$(mktemp -d)/config"
mkdir -p "$XDG_CONFIG_HOME"

# Without a user-dirs.dirs in the throwaway config, GNOME falls back to $HOME and
# screenshots taken in the nested land in the host home. Redirect them to a temp dir.
NESTED_HOME="$(mktemp -d)/home"
mkdir -p "$NESTED_HOME"
for d in DESKTOP DOWNLOAD TEMPLATES PUBLICSHARE DOCUMENTS MUSIC PICTURES VIDEOS; do
  echo "XDG_${d}_DIR=\"$NESTED_HOME\"" >>"$XDG_CONFIG_HOME/user-dirs.dirs"
done
# Keep xdg-user-dirs-update from rewriting the file and recreating the host folders.
echo "enabled=False" >"$XDG_CONFIG_HOME/user-dirs.conf"

# Throwaway XDG_DATA_HOME pointing at src/, so the nested always runs the working
# tree and never an installed release. XDG_DATA_HOME wins over XDG_DATA_DIRS, which
# is left untouched so icon themes stay reachable.
export XDG_DATA_HOME="$(mktemp -d)/data"
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions"
ln -sfn "$REPO_ROOT/src" "$XDG_DATA_HOME/gnome-shell/extensions/$UUID"

echo "nested XDG_DATA_HOME: $XDG_DATA_HOME"

exec dbus-run-session -- bash -c "
  gsettings set org.gnome.shell enabled-extensions \"['$UUID']\"
  gsettings set org.gnome.desktop.input-sources sources \"[('xkb', 'fr')]\"
  exec gnome-shell --devkit --wayland
"
