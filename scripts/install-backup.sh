#!/usr/bin/env bash
#
# Installs the backup job on this host.
#
# The script is copied out of the repository rather than run from it, because
# macOS refuses a launchd agent access to ~/Documents without Full Disk Access,
# and granting that to /bin/bash would give every shell script on the machine
# the same reach. The repository copy stays canonical: re-run this after
# editing scripts/backup-db.sh, or the schedule keeps running the old one.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-db.sh"
DEST_DIR="$HOME/.config/bottleneck-auth"
DEST="$DEST_DIR/backup-db.sh"
PLIST="$HOME/Library/LaunchAgents/com.bottleneck.auth-backup.plist"
LABEL="com.bottleneck.auth-backup"

[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }
mkdir -p "$DEST_DIR" "$HOME/auth-backups"
install -m 700 "$SRC" "$DEST"
echo "installed $DEST"

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "reloaded $LABEL"
  launchctl list | grep -F "$LABEL" || true
else
  echo "no launch agent at $PLIST; install it to schedule daily runs" >&2
fi

if [ ! -f "$DEST_DIR/backup-age-recipient.txt" ]; then
  cat >&2 <<'MSG'

No age recipient yet. Generate a keypair, then move the identity OFF this
machine (a password manager is fine) and delete the local copy:

  age-keygen -o ~/.config/bottleneck-auth/backup-age-identity.txt
  age-keygen -y ~/.config/bottleneck-auth/backup-age-identity.txt \
    > ~/.config/bottleneck-auth/backup-age-recipient.txt

Only the recipient stays here. Without the identity nobody can read a backup,
including you, so losing it means losing every backup taken with it.
MSG
fi
