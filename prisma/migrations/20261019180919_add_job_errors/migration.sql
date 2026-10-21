-- Нова таблиця помилок виконання джоб. Лише CREATE нових об'єктів, наявних
-- таблиць спільної бази не чіпає (FK веде з нової таблиці на jobs).
CREATE TABLE "job_errors" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "error" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_errors_job_id_idx" ON "job_errors"("job_id");

ALTER TABLE "job_errors"
  ADD CONSTRAINT "job_errors_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
