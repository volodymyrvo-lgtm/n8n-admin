-- Папки ассетів з Customer.io. Лише CREATE нової таблиці, наявних таблиць
-- спільної бази не чіпає. Унікальний індекс по external_id гарантує, що
-- повторна синхронізація не створює дублів.
CREATE TABLE "customer_folders" (
    "id" UUID NOT NULL,
    "external_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parent_external_id" INTEGER,
    "external_created_at" TIMESTAMPTZ(3) NOT NULL,
    "external_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_folders_external_id_key" ON "customer_folders"("external_id");
CREATE INDEX "customer_folders_parent_external_id_idx" ON "customer_folders"("parent_external_id");
