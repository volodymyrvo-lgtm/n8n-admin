-- Цілісність для kind = design: обов'язкові task_description і llm
-- (steps NOT NULL і так). Застосовувати ПІСЛЯ 20261026100000_add_job_kind_design.
-- Усі наявні рядки мають kind communication або seo, тож нову перевірку проходять.
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_kind_required_fields_check";

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
    AND "llm" IS NOT NULL
  )
);
