# Erasure runbook

What organizers do by hand to honour the privacy notice (`docs/privacy.md`). Erasure requests are expected to be rare, so the Discord and backup parts stay manual.

## A player asks to be erased

Answer within one month of the request.

1. Open the player's page in a season they played (`/seasons/<slug>/players/<id>`), scroll to **Erase player**, type their name and confirm. The site:
   - renames them "Former player N" and removes their avatar and Discord link;
   - logs them out everywhere;
   - clears the reasons on flags they filed;
   - writes an `erase` row to each of their seasons' audit logs.

   Their results stay, so standings don't change. If they log in again later, they start as a new player with no history.

2. **Discord, during a season:** search the results, pairings and organizers channels for their name and delete the bot's posts that name them.
3. **A player who never signed up for a season** has no player page. Remove them in SQLite on the server (`sqlite3 data/poroleague.db`, adjusting the path to your `DATABASE_URL`):
   ```sql
   delete from sessions where player_id = (select id from players where discord_id = '<discord id>');
   delete from players where discord_id = '<discord id>';
   ```
4. Tell the player it's done.

## When a season finishes

Delete the webhook posts for that season in the results, pairings and organizers channels (Discord search, or a moderation bot's purge command). The privacy notice promises this.

## After restoring a backup

A backup made before an erasure still holds that player. Before the restored site goes live:

1. Keep a copy of the database as it was just before the restore.
2. In that copy, list the erasures newer than the backup:
   ```sql
   select a.created_at, a.after ->> '$.erased' as player_id
   from audit a where a.action = 'erase' and a.created_at > <backup time, unix seconds>;
   ```
3. Erase each of those player ids again on the restored site (step 1 above). If one has no player page, use step 3 with their id (`where id = '<player id>'`).
4. Delete the pre-restore copy once every erasure is re-applied.

Backups rotate out after 14 nights (`scripts/backup.sh`), plus however long the off-box copies are kept.
