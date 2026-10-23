-- Design-джоба створюється лише з task_description (llm залишається NULL, steps
-- починаються порожнім об'єктом). Тому для kind = design обов'язковим лишається
-- тільки task_description. Скрипт ідемпотентний: працює і тоді, коли попередня
-- міграція 20261026100100_job_kind_design_check уже застосована, і тоді, коли ні
-- (у другому разі спершу застосуйте 20261026100000_add_job_kind_design).
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
