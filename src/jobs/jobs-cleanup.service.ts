import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Щоденне прибирання застарілих джоб. Видаляємо за createdAt (датою
 * створення), а не runDate/updatedAt — саме так просив користувач.
 * Job.jobRules має onDelete: Cascade на jobId, тож пов'язані рядки
 * в job_rules приберуться автоматично разом з джобою.
 */
@Injectable()
export class JobsCleanupService {
  private readonly logger = new Logger(JobsCleanupService.name);
  private static readonly MAX_AGE_MONTHS = 1;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async removeStaleJobs(): Promise<void> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - JobsCleanupService.MAX_AGE_MONTHS);

    const { count } = await this.prisma.job.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (count > 0) {
      this.logger.log(`Видалено ${count} джоб(и), створених до ${cutoff.toISOString()}`);
    }
  }
}
