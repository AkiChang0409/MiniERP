-- B4 follow-up (option A): first-class task Priority, mirrored to the Bitable
-- "Priority" single-select (P0 highest … P3). Nullable — existing tasks and
-- non-prioritized creates simply have no priority.
ALTER TABLE `project_tasks` ADD COLUMN `priority` text;
