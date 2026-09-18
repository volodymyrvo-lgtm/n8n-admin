-- DropForeignKey
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_rule_id_fkey";

-- DropIndex
DROP INDEX "jobs_rule_id_idx";

-- AlterTable: джоба більше не має єдиного rule_id — зв'язок винесено в окрему таблицю.
ALTER TABLE "jobs" DROP COLUMN "rule_id";

-- CreateTable
CREATE TABLE "job_rules" (
    "job_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,

    CONSTRAINT "job_rules_pkey" PRIMARY KEY ("job_id","rule_id")
);

-- CreateIndex
CREATE INDEX "job_rules_rule_id_idx" ON "job_rules"("rule_id");

-- AddForeignKey: видалення джоби прибирає її власні зв'язки — Cascade.
ALTER TABLE "job_rules" ADD CONSTRAINT "job_rules_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: правило не можна видалити, поки на нього посилається хоч одна джоба — Restrict.
ALTER TABLE "job_rules" ADD CONSTRAINT "job_rules_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
