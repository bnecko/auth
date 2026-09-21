# Restoring auth from an encrypted backup

**Last reviewed:** 2026-09-20
**Owner:** Matthew Demidoff
**Pages on:** "Backup FAILED" Telegram alert; any total loss of the database volume

## What this is for

The auth database is gone, corrupted, or has to be rolled back to a known good
point. Backups run daily and go offsite encrypted; this is how you get one back.

## Before you start

You need the **age identity**. It is deliberately not on this machine: only the
public half is. Without it a backup is unreadable and nothing below works. It
lives wherever you put it when backups were set up (password manager or offline
media). If you cannot find it, stop and read "If the identity is lost" below.

## Severity guidance

Total loss of the database is page-immediately: every account, session and
donation record is in it. A single bad migration is lower, because the previous
day's backup is intact and you have time to think.

## Steps

1. Get the newest backup pair.

       rclone lsf "$BACKUP_RCLONE_REMOTE" | sort | tail -4
       rclone copy "$BACKUP_RCLONE_REMOTE/auth-<stamp>.dump.age" ~/auth-restore/
       rclone copy "$BACKUP_RCLONE_REMOTE/auth-<stamp>.secrets.age" ~/auth-restore/

   Expect two files per stamp, roughly 160K and 4K. If the remote is empty or
   the newest stamp is older than two days, the backup job has been failing
   silently: check `launchctl list | grep bottleneck` and the log at
   `~/auth-backups/backup.log`. Older backups still restore fine.

2. Decrypt both.

       age -d -i /path/to/identity.txt -o ~/auth-restore/auth.dump ~/auth-restore/auth-<stamp>.dump.age
       age -d -i /path/to/identity.txt ~/auth-restore/auth-<stamp>.secrets.age | tar -xzf - -C ~/auth-restore/

   Expect a readable dump and a `secrets/` folder holding the env files
   (`core.env`, `telegram.env`, `crypto.env`, `ops.env`; a backup taken before
   the split holds a single `prod.env` instead), `oidc-private.pem` and
   `oidc-public.pem`. If age says "no identity matched",
   you have the wrong identity file, not a corrupt backup.

3. Confirm the dump is intact before touching anything live.

       docker run --rm -i -v ~/auth-restore:/w postgres:16-alpine pg_restore -l /w/auth.dump | grep -c 'TABLE DATA'

   Expect 30 or more. If it errors, use the previous stamp and note that the
   verification step in `scripts/backup-db.sh` did not catch it.

4. Stop the services that write to the database. Leave `db` running. Point
   compose at the env files first, in this shell, so every command below
   finds them. Every file in the list has to exist.

       cd ~/Documents/auth
       d=~/.config/bottleneck-auth
       export COMPOSE_ENV_FILES="$d/core.env,$d/telegram.env,$d/crypto.env,$d/ops.env"
       docker compose stop app worker bot

   If this host still runs on a single file, the export is
   `COMPOSE_ENV_FILES="$d/prod.env"` instead.

5. Restore. This drops and recreates the schema, so be sure about step 3.

       docker compose exec -T db \
         psql -U auth -d postgres -c "drop database auth with (force); create database auth owner auth;"
       docker compose exec -T db \
         pg_restore -U auth -d auth --no-owner < ~/auth-restore/auth.dump

   Ownership warnings are normal. Any error mentioning "relation already
   exists" means the drop did not happen: re-run the drop.

6. Put the secrets back only if they are also lost. A restored database with a
   different OIDC signing key cannot validate tokens issued before the loss,
   and every existing session breaks.

       install -m 600 ~/auth-restore/secrets/*.env ~/.config/bottleneck-auth/
       cp ~/auth-restore/secrets/oidc-*.pem ~/Documents/auth/

   If what came back is a single `prod.env`, re-export `COMPOSE_ENV_FILES` to
   name it, as in step 4.

7. Start back up. The app runs migrations on boot, so a backup older than the
   current code catches up by itself.

       docker compose up -d app
       docker compose up -d --no-deps worker bot

8. Shred the plaintext. It is the whole database sitting unencrypted on disk.

       rm -rf ~/auth-restore

## Verification

    curl -s -o /dev/null -w '%{http_code}\n' https://auth.bneck.com/api/health

Expect 200. Then confirm the data is really there, not just the schema:

    docker compose exec -T db psql -U auth -d auth -t -A -c \
      "select (select count(*) from users), (select count(*) from ton_donations), (select max(version) from schema_migrations);"

Sign in on the web as a real account. If sign-in fails but health is 200, the
OIDC key in the env does not match the restored data: revisit step 6.

## If the identity is lost

The backups cannot be decrypted. Nobody can recover them, which is the design.
Generate a new keypair, store the identity offline immediately, update
`~/.config/bottleneck-auth/backup-age-recipient.txt`, and run
`scripts/backup-db.sh` by hand so a readable backup exists again. Treat the old
offsite copies as junk and delete them.

## Known false positives

A "Backup stayed LOCAL" alert is not a failure: it means
`BACKUP_RCLONE_REMOTE` is unset, so the encrypted copy exists only on this
machine. The fix is configuring the remote, not restoring anything.
