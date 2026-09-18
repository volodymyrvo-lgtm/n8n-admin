import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateRuleDto } from './dto/create-rule.dto.js';
import { RuleResponseDto } from './dto/rule-response.dto.js';
import { UpdateRuleDto } from './dto/update-rule.dto.js';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRuleDto): Promise<RuleResponseDto> {
    const rule = await this.prisma.rule.create({
      data: {
        ruleName: dto.ruleName,
        // Record<string, unknown> проходить валідацію class-validator як
        // "непорожній об'єкт", але Prisma для JSON-полів вимагає власний
        // рекурсивний тип, а не `unknown` — тому явний каст саме тут.
        ruleSet: dto.ruleSet as Prisma.InputJsonValue,
        setType: dto.setType,
      },
    });

    return rule;
  }

  findAll(): Promise<RuleResponseDto[]> {
    return this.prisma.rule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateRuleDto): Promise<RuleResponseDto> {
    try {
      const rule = await this.prisma.rule.update({
        where: { id },
        data: {
          ruleName: dto.ruleName,
          // undefined тут означає "поле не передали" — Prisma просто
          // пропустить його й не чіпатиме значення в базі.
          ruleSet: dto.ruleSet as Prisma.InputJsonValue | undefined,
          setType: dto.setType,
        },
      });

      return rule;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Rule "${id}" not found`);
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.rule.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Rule "${id}" not found`);
        }

        // JobRule.ruleId має onDelete: Restrict — БД не дасть видалити
        // правило, поки на нього посилається хоча б одна джоба через
        // проміжну таблицю job_rules. P2003 — типовий код для порушення
        // FK-обмеження, P2014 лишаю як захисний дубль.
        if (error.code === 'P2003' || error.code === 'P2014') {
          throw new ConflictException(
            `Rule "${id}" cannot be deleted: it is still referenced by one or more jobs`,
          );
        }
      }

      throw error;
    }
  }
}
