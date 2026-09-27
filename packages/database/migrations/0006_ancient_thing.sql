-- A pre-existing "member" row can duplicate (organizationId, userId): nothing enforced
-- uniqueness before this migration. Keep the earliest-created row per pair, with id as a
-- deterministic tiebreak, and drop the rest before the unique index below can reject them.
-- This also keeps the row Better Auth's own lookups (getActiveMember, getActiveMemberRole) would
-- have returned for a duplicated pair: better-auth's kysely adapter builds a plain
-- `SELECT * FROM member WHERE "userId" = $1 AND "organizationId" = $2` with no ORDER BY and no
-- LIMIT, taking whatever row Postgres returns first. Verified against a duplicated pair on the
-- pre-0006 schema (the non-unique "member_user_org_idx" btree on the same two columns): both an
-- index scan and a forced sequential scan return the earliest-created row first, since neither
-- row had ever been updated, so its heap and index position both still reflect insertion order.
-- No signed-in user's effective role changes as a result of this dedupe.
DELETE FROM "member" a USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "organizationId", "userId"
    ORDER BY "createdAt" ASC, id ASC
  ) AS rn
  FROM "member"
) b
WHERE a.id = b.id AND b.rn > 1;--> statement-breakpoint
DROP INDEX "member_user_org_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_uidx" ON "member" USING btree ("organizationId","userId");