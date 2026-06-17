-- Assignee task-submission note: a free-text "how I completed this" captured on
-- the personal task-detail page. Used for tasks without ISO records (where there
-- is no qms_record to hold the note) and as a general note otherwise. File
-- evidence will reuse the attachment/email-ingestion path later.

ALTER TABLE `project_tasks` ADD `submission_note` text;
