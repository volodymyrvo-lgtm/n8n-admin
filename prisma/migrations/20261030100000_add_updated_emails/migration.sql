-- Оновлені HTML-листи. Лише CREATE нової таблиці, наявних таблиць спільної бази
-- не чіпає. email_id не унікальний: один лист може мати кілька версій.
CREATE TABLE "updated_emails" (
    "id" UUID NOT NULL,
    "email_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "updated_emails_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "updated_emails_email_id_idx" ON "updated_emails"("email_id");
