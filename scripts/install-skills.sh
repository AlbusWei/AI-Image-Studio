#!/usr/bin/env bash
# ============================================================
#  Install QoderWork Skills from this repository
#  Usage: bash scripts/install-skills.sh  (from project root)
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/.qoderwork/skills"
SKILLS_DST="$HOME/.qoderwork/skills"

echo "QoderWork Skills Installer"
echo "=========================="
echo

if [ ! -d "$SKILLS_SRC" ]; then
    echo "ERROR: No skills found at $SKILLS_SRC"
    echo "Make sure you're running this script from the project root."
    exit 1
fi

INSTALLED=0

for SKILL_DIR in "$SKILLS_SRC"/*/; do
    [ -d "$SKILL_DIR" ] || continue
    SKILL_NAME="$(basename "$SKILL_DIR")"

    echo "Installing skill: $SKILL_NAME ..."

    mkdir -p "$SKILLS_DST/$SKILL_NAME"
    cp -r "$SKILL_DIR"* "$SKILLS_DST/$SKILL_NAME/"

    echo "  [OK] $SKILL_NAME installed to $SKILLS_DST/$SKILL_NAME"
    INSTALLED=$((INSTALLED + 1))
done

echo
echo "Done. $INSTALLED skill(s) installed to $SKILLS_DST"
echo "Restart QoderWork to activate new skills."
