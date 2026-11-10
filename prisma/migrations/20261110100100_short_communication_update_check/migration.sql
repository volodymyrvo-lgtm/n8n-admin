-- Для task_status short_communication_update джоба приходить лише з job_type і
-- message_type (і необов'язковою language), тому board і task_description для
-- неї можуть бути NULL. Решта гілок без змін.
-- Спершу застосуйте 20261110100000_add_short_communication_update.
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_kind_required_fields_check";

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_kind_required_fields_check" CHECK (
  (
    "kind" = 'communication'
    AND "job_type" IS NOT NULL
    AND "task_status" IS NOT NULL
    AND "message_type" IS NOT NULL
    AND "board" IS NOT NULL
    AND "task_description" IS NOT NULL
  )
  OR
  (
    "kind" = 'communication'
    AND "task_status" IN ('welcome_email_html_update', 'system_email_html_update')
    AND "task_description" IS NOT NULL
  )
  OR
  (
    "kind" = 'communication'
    AND "task_status" = 'short_communication_update'
    AND "job_type" IS NOT NULL
    AND "message_type" IS NOT NULL
  )
  OR
  (
    "kind" = 'seo'
    AND "language" IS NOT NULL
    AND "prompt" IS NOT NULL
    AND "page_task" IS NOT NULL
    AND "llm" IS NOT NULL
  )
  OR
  (
    "kind" = 'design'
    AND "task_description" IS NOT NULL
  )
);
