-- Нова таблиця щоденних витрат на LLM (звіт n8n). Лише CREATE нових
-- об'єктів — жодних змін у наявних таблицях спільної бази.
CREATE TABLE "llm_usage_daily" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "flow" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "llm_mod" TEXT NOT NULL,
    "requests" INTEGER NOT NULL,
    "input_tokens" BIGINT NOT NULL,
    "output_tokens" BIGINT NOT NULL,
    "cache_read_tokens" BIGINT NOT NULL,
    "cache_write_tokens" BIGINT NOT NULL,
    "cost" DECIMAL(18,8) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "llm_usage_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "llm_usage_daily_date_flow_llm_mod_key" ON "llm_usage_daily"("date", "flow", "llm_mod");
CREATE INDEX "llm_usage_daily_date_idx" ON "llm_usage_daily"("date");
CREATE INDEX "llm_usage_daily_type_date_idx" ON "llm_usage_daily"("type", "date");
