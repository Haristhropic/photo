-- 0001 and 0002 were applied before snapshots existed, so Drizzle generated
-- their changes again here. The live database already has those columns and the
-- index; only the new layout value is needed.
ALTER TYPE "public"."layout_type" ADD VALUE 'STRIP_2' BEFORE 'STRIP_3';