-- Для task_status welcome_email_html_update / system_email_html_update джоба
-- приходить лише з task_description (і необов'язковим is_banner_update), тому
-- job_type, message_type і board для неї можуть бути NULL. Решта гілок без змін.
-- Спершу застосуйте 20261028100000_add_html_update_task_statuses.
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
