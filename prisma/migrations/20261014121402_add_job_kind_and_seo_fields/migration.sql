-- Розширення jobs під SEO-джоби. Лише нові об'єкти + послаблення NOT NULL
-- на п'яти стовпцях самої таблиці jobs; інших таблиць спільної бази не чіпає.

-- 1. Вид джоби. DEFAULT 'communication' одразу проставляє значення всім
--    наявним рядкам — окрема міграція даних не потрібна.
CREATE TYPE "job_kind" AS ENUM ('communication', 'seo');

ALTER TABLE "jobs"
  ADD COLUMN "kind" "job_kind" NOT NULL DEFAULT 'communication',
  ADD COLUMN "language" TEXT,
  ADD COLUMN "prompt" TEXT,
  ADD COLUMN "page_task" TEXT;

-- 2. Поля, які мають лише communication-джоби, стають nullable.
ALTER TABLE "jobs"
  ALTER COLUMN "job_type" DROP NOT NULL,
  ALTER COLUMN "task_status" DROP NOT NULL,
  ALTER COLUMN "message_type" DROP NOT NULL,
  ALTER COLUMN "board" DROP NOT NULL,
  ALTER COLUMN "task_description" DROP NOT NULL;

-- 3. Цілісність на рівні БД: що обов'язково для кожного виду. Усі наявні
--    рядки — communication з заповненими полями, тож перевірку проходять.
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
);

-- 4. Список джоб фільтрується за kind і сортується за created_at.
CREATE INDEX "jobs_kind_created_at_idx" ON "jobs"("kind", "created_at");
