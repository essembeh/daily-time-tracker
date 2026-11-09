# Dev tools for the checks the CI runs (see CLAUDE.md). Loaded by direnv via .envrc.
{pkgs ? import <nixpkgs> {}}:
pkgs.mkShellNoCC {
  packages = [
    pkgs.nodejs-slim # syntax check, tests/unit.mjs, tests/check-markdown.mjs
    pkgs.glib # glib-compile-schemas
  ];
}
