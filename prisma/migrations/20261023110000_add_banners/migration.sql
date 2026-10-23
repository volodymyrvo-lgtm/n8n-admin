-- Черга модерації банерів. Лише CREATE нових об'єктів, наявних таблиць
-- спільної бази не чіпає (FK веде з нової таблиці на jobs). Файли банерів
-- лежать у Supabase Storage, тут тільки метадані та шлях до файлу.
CREATE TYPE "banner_status" AS ENUM ('pending', 'approved', 'rejected', 'sending', 'sent', 'send_failed');

CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "figma_image_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'image/png',
    "size_bytes" INTEGER NOT NULL,
    "status" "banner_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "banners_status_created_at_idx" ON "banners"("status", "created_at");
CREATE INDEX "banners_job_id_idx" ON "banners"("job_id");

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
