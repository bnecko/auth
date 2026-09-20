#!/usr/bin/env bash
#
# Encrypted offsite backup of the auth database and the secrets a dump cannot
# restore without.
#
# Two artifacts go offsite each run:
#   auth-<stamp>.dump.age     the database, pg_dump custom format
#   auth-<stamp>.secrets.age  the env file and the OIDC signing keys
#
# The second one matters as much as the first. A restored database with no
# signing key cannot issue a token, so the service would come back unable to
# log anyone in.
#
# Encryption is age with a public recipient only. This host cannot decrypt what
# it just wrote, which is the point: whoever holds the offline identity can
# restore, and someone who takes this machine gets ciphertext.
#
# Exit codes: 0 success, 1 failure (and a Telegram alert was attempted).

set -euo pipefail

# Nothing here may live under ~/Documents. macOS blocks a launchd agent from
# touching that folder without Full Disk Access, and granting it to /bin/bash
# would hand every shell script on the machine the same access. So the database
# is reached by container name rather than through the compose file, and the
# secrets are read from ~/.config.
SECRETS_DIR_SRC="${BACKUP_SECRETS_DIR:-$HOME/.config/bottleneck-auth}"
ENV_FILE="${BACKUP_ENV_FILE:-$SECRETS_DIR_SRC/prod.env}"
DB_CONTAINER="${BACKUP_DB_CONTAINER:-auth-db-1}"
STAGING="${BACKUP_STAGING_DIR:-$HOME/auth-backups}"
RECIPIENT_FILE="${BACKUP_RECIPIENT_FILE:-$SECRETS_DIR_SRC/backup-age-recipient.txt}"

# A docker compose env file is not a shell script. Values are unquoted, so one
# containing spaces or angle brackets (EMAIL_FROM_ADDRESS holds both) makes
# bash try to redirect. Read the few keys this script needs instead, preferring
# anything already exported.
env_get() {
  local key="$1" current="${!1:-}"
  if [ -n "$current" ]; then printf '%s' "$current"; return 0; fi
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*${key}=//p" "$ENV_FILE" | tail -1
}

TELEGRAM_BOT_TOKEN="$(env_get TELEGRAM_BOT_TOKEN)"
ALERT_TELEGRAM_CHAT_ID="$(env_get ALERT_TELEGRAM_CHAT_ID)"
REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
RETAIN_LOCAL="$(env_get BACKUP_RETAIN_LOCAL)"; RETAIN_LOCAL="${RETAIN_LOCAL:-7}"
RETAIN_REMOTE_DAYS="$(env_get BACKUP_RETAIN_REMOTE_DAYS)"; RETAIN_REMOTE_DAYS="${RETAIN_REMOTE_DAYS:-90}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { printf '%s backup: %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# Best effort, and never the reason the script fails: a backup that worked but
# could not announce itself is still a backup.
alert() {
  local text="$1"
  log "$text"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${ALERT_TELEGRAM_CHAT_ID:-}" ]; then
    curl -sS -m 10 -o /dev/null \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${ALERT_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${text}" || true
  fi
}

fail() {
  alert "Backup FAILED ($STAMP)
$1"
  exit 1
}

[ -f "$RECIPIENT_FILE" ] || fail "no age recipient at $RECIPIENT_FILE"
RECIPIENT="$(tr -d '[:space:]' < "$RECIPIENT_FILE")"
[ -n "$RECIPIENT" ] || fail "age recipient file is empty"
mkdir -p "$STAGING"

log "dumping database from $DB_CONTAINER"
docker exec -i "$DB_CONTAINER" pg_dump -U auth -d auth -Fc > "$WORK/auth.dump" \
  || fail "pg_dump failed (is $DB_CONTAINER running and Docker started?)"

# A dump that cannot be listed is not a backup. This runs on the plaintext,
# before encryption, because after encryption this host can no longer read it.
TABLES="$(docker run --rm -i -v "$WORK:/w" postgres:16-alpine \
  pg_restore -l /w/auth.dump 2>/dev/null | grep -c 'TABLE DATA' || true)"
[ "${TABLES:-0}" -gt 0 ] || fail "dump is unreadable (pg_restore -l found no tables)"
log "dump holds $TABLES tables, $(du -h "$WORK/auth.dump" | cut -f1)"

log "bundling secrets"
SECRETS_DIR="$WORK/secrets"
mkdir -p "$SECRETS_DIR"
cp "$ENV_FILE" "$SECRETS_DIR/prod.env" 2>/dev/null || fail "could not read $ENV_FILE"
for pem in "$SECRETS_DIR_SRC"/oidc-*.pem; do
  [ -f "$pem" ] && cp "$pem" "$SECRETS_DIR/" || true
done
tar -czf "$WORK/auth.secrets.tar.gz" -C "$WORK" secrets

log "encrypting to $RECIPIENT"
age -r "$RECIPIENT" -o "$STAGING/auth-$STAMP.dump.age" "$WORK/auth.dump" || fail "age failed on dump"
age -r "$RECIPIENT" -o "$STAGING/auth-$STAMP.secrets.age" "$WORK/auth.secrets.tar.gz" || fail "age failed on secrets"

if [ -z "$REMOTE" ]; then
  alert "Backup stayed LOCAL ($STAMP)
BACKUP_RCLONE_REMOTE is unset, so nothing went offsite. $TABLES tables dumped and encrypted in $STAGING."
  exit 0
fi

log "uploading to $REMOTE"
for f in "$STAGING/auth-$STAMP.dump.age" "$STAGING/auth-$STAMP.secrets.age"; do
  rclone copy --no-traverse "$f" "$REMOTE" || fail "rclone copy failed for $(basename "$f")"
done

# Confirm the bytes actually landed, rather than trusting a zero exit code.
for f in "$STAGING/auth-$STAMP.dump.age" "$STAGING/auth-$STAMP.secrets.age"; do
  name="$(basename "$f")"
  local_size=$(wc -c < "$f" | tr -d ' ')
  remote_size=$(rclone size --json "$REMOTE/$name" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
  [ "$local_size" = "$remote_size" ] || fail "size mismatch for $name (local $local_size, remote ${remote_size:-none})"
done

log "pruning"
find "$STAGING" -name 'auth-*.age' -type f -mtime "+$RETAIN_LOCAL" -delete 2>/dev/null || true
rclone delete --min-age "${RETAIN_REMOTE_DAYS}d" "$REMOTE" 2>/dev/null || true

alert "Backup ok ($STAMP)
$TABLES tables, $(du -h "$STAGING/auth-$STAMP.dump.age" | cut -f1) encrypted, offsite at $REMOTE"
