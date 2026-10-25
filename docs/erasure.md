# Erasure runbook

What organizers do by hand to honour the privacy notice (`docs/privacy.md`). Erasure requests are expected to be rare, so the Discord and backup parts stay manual.

## A player asks to be erased

Answer within one month of the request.

1. Open the player's page in a season they played (`/seasons/<slug>/players/<id>`), scroll to **Erase player**, type their name and confirm. The site:
   - renames them "Former player" plus a short random code (e.g. "Former player 3f9a") and removes their avatar and Discord link;
   - logs them out everywhere;
   - clears the reasons on flags they filed;
   - takes them off seasons in signup or groups, and drops them from seasons in play (their matches there are void; the drop can't be cancelled);
   - writes an `erase` row to the audit log of each season they stay in.

   Results in finished seasons stay, so those standings don't change. If they log in again later, they start as a new player with no history.

2. **Discord, during a season:** search the results, pairings and organizers channels for their name and delete the bot's posts that name them.
3. **A player who never signed up for a season** has no player page. Anonymise them in SQLite on the server (`sqlite3 data/poroleague.db`, adjusting the path to your `DATABASE_URL`). Don't delete the row: organizers who never played still appear in the audit log and match history.
   ```sql
   delete from sessions where player_id = (select id from players where discord_id = '<discord id>');
   update players set display_name = 'Former player ' || lower(hex(randomblob(2))),
     avatar = null, discord_id = null, erased_at = unixepoch()
   where discord_id = '<discord id>';
   ```
4. Tell the player it's done.

## When a season finishes

Delete the webhook posts for that season in the results, pairings and organizers channels (Discord search, or a moderation bot's purge command). The privacy notice promises this.

## After restoring a backup

A backup made before an erasure still holds that player. Before the restored site goes live:

1. Keep a copy of the database as it was just before the restore.
2. In that copy, list the erasures newer than the backup:
   ```sql
   select id, erased_at from players where erased_at > <backup time, unix seconds>;
   ```
   This catches every erasure, including players taken off a signup list and the hand-run SQL in step 3, which write no `erase` audit row.
3. Erase each of those player ids again on the restored site (step 1 above). If one has no player page, use step 3 with their id (`where player_id = '<player id>'` and `where id = '<player id>'`).
4. Delete the pre-restore copy once every erasure is re-applied.

Backups rotate out after 14 nights on the server (`scripts/backup.sh`) and after 30 days off-box (R2 lifecycle rule).
