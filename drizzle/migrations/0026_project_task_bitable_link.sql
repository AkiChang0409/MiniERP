-- B4: project tasks Bitable write-through.
-- Stores the linked Bitable "Tasks" table record id so a later update writes
-- through to the SAME record (source of truth) instead of creating a duplicate.
-- Nullable: tasks created before write-through (or when write-through is off)
-- simply have no link until their next governed write.
ALTER TABLE `project_tasks` ADD COLUMN `bitable_record_id` text;

CREATE INDEX IF NOT EXISTS `project_tasks_bitable_record_idx`
ON `project_tasks` (`bitable_record_id`);
