-- Файли, завантажені в Customer.io (відповідь POST /assets/files). Лише CREATE
-- нової таблиці, наявних таблиць спільної бази не чіпає. email_id — це
-- figmaImageName банера, path — посилання на файл у Customer.io.
CREATE TABLE "customer_assets" (
    "id" UUID NOT NULL,
    "email_id" TEXT NOT NULL,
    "path" TEXT,
    "external_id" INTEGER NOT NULL,
    "name" TEXT,
    "parent_folder_id" INTEGER,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_assets_external_id_key" ON "customer_assets"("external_id");
CREATE INDEX "customer_assets_email_id_idx" ON "customer_assets"("email_id");
