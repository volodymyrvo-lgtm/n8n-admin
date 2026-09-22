import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateGlossaryDto } from './dto/create-glossary.dto.js';
import { GlossaryResponseDto } from './dto/glossary-response.dto.js';
import { UpdateGlossaryDto } from './dto/update-glossary.dto.js';

/** Форма all_gloss_rules: {"entries": [...]} + довільні інші ключі, які ми не чіпаємо. */
type GlossaryRoot = { entries: unknown[] } & Record<string, unknown>;

@Injectable()
export class GlossariesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGlossaryDto): Promise<GlossaryResponseDto> {
    // Захист від випадкового створення глосарія без entries — той самий
    // збій, що стався при update() (22.09.2026): клієнт надіслав
    // allGlossRules без ключа "entries" взагалі, і БД це не зловила
    // (constraint glossaries_rules_has_entries дозволяє відсутність ключа,
    // забороняє лише порожній масив). Перевіряємо структуру тут, до запису.
    GlossariesService.assertHasEntriesArray(dto.allGlossRules);

    try {
      const glossary = await this.prisma.glossary.create({
        data: {
          glossaryName: dto.glossaryName,
          // Record<string, unknown> проходить class-validator як "непорожній
          // об'єкт", але Prisma для JSON-полів вимагає власний рекурсивний
          // тип, а не `unknown` — тому явний каст саме тут (як у rules).
          allGlossRules: dto.allGlossRules as Prisma.InputJsonValue,
          setType: dto.setType,
        },
      });

      return glossary;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Glossary "${dto.glossaryName}" already exists`);
      }

      throw error;
    }
  }

  findAll(): Promise<GlossaryResponseDto[]> {
    return this.prisma.glossary.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateGlossaryDto): Promise<GlossaryResponseDto> {
    // PATCH /glossaries/:id більше НІКОЛИ не чіпає entries — навіть якщо
    // клієнт передав allGlossRules без "entries" або з якимось іншим
    // масивом entries. Якщо allGlossRules взагалі є в тілі запиту, беремо
    // поточний entries з БД і примусово підставляємо його в результат:
    // єдиний спосіб змінити самі терміни — дедіковані
    // /glossaries/:id/entries[/:entryId] ендпоінти. Саме відсутність цього
    // й дозволила стерти entries 22.09.2026.
    let allGlossRules: Prisma.InputJsonValue | undefined;

    if (dto.allGlossRules !== undefined) {
      const current = await this.findRawOrThrow(id);
      const currentRoot = GlossariesService.parseRoot(current.allGlossRules);
      allGlossRules = { ...dto.allGlossRules, entries: currentRoot.entries } as Prisma.InputJsonValue;
    }

    try {
      const glossary = await this.prisma.glossary.update({
        where: { id },
        data: {
          glossaryName: dto.glossaryName,
          // undefined тут означає "поле не передали" — Prisma просто
          // пропустить його й не чіпатиме значення в базі.
          allGlossRules,
          setType: dto.setType,
        },
      });

      return glossary;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Glossary "${id}" not found`);
        }

        if (error.code === 'P2002') {
          throw new ConflictException(`Glossary "${dto.glossaryName}" already exists`);
        }
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.glossary.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Glossary "${id}" not found`);
      }

      throw error;
    }
  }

  // ---------- entries (окремий термін усередині allGlossRules.entries) ----------

  /**
   * Записи глосарія не мають власної колонки/id у БД — увесь глосарій це
   * один JSON-блоб (allGlossRules.entries: [...]). Кожен запис тепер несе
   * власне поле "id" (UUID, проставляється тут на бекенді, а не клієнтом —
   * бекфіл для вже існуючих записів робиться окремим одноразовим скриптом).
   * "CRUD на один термін" — це read-modify-write: читаємо весь об'єкт,
   * знаходимо/додаємо/міняємо/видаляємо потрібний елемент масиву за id і
   * зберігаємо назад УВЕСЬ JSON одним UPDATE. Конкурентний запис із двох
   * місць одночасно теоретично може перезаписати чужу зміну (last write
   * wins) — для адмінки з нечастими правками це прийнятний компроміс.
   */
  async listEntries(id: string): Promise<unknown[]> {
    const glossary = await this.findRawOrThrow(id);
    return GlossariesService.parseRoot(glossary.allGlossRules).entries;
  }

  async addEntry(id: string, entry: Record<string, unknown>): Promise<GlossaryResponseDto> {
    const glossary = await this.findRawOrThrow(id);
    const root = GlossariesService.parseRoot(glossary.allGlossRules);

    // english_term лишається змістовним обов'язковим полем даних, але
    // адресація (PATCH/DELETE) тепер іде по id, а не по ньому.
    const { id: _ignoredClientId, ...rest } = entry;
    GlossariesService.requireEnglishTerm(rest);
    const newEntry = { id: randomUUID(), ...rest };

    return this.persistRoot(id, { ...root, entries: [...root.entries, newEntry] });
  }

  async updateEntry(id: string, entryId: string, patch: Record<string, unknown>): Promise<GlossaryResponseDto> {
    const glossary = await this.findRawOrThrow(id);
    const root = GlossariesService.parseRoot(glossary.allGlossRules);
    const index = root.entries.findIndex((existing) => GlossariesService.sameId(existing, entryId));

    if (index === -1) {
      throw new NotFoundException(`Entry "${entryId}" not found in glossary "${id}"`);
    }

    const current = root.entries[index] as Record<string, unknown>;
    // id — стабільна ідентичність запису, патч не може його підмінити.
    const { id: _ignoredPatchId, ...safePatch } = patch;
    const merged = { ...current, ...safePatch, id: current.id };
    GlossariesService.requireEnglishTerm(merged);

    const entries = root.entries.map((existing, i) => (i === index ? merged : existing));
    return this.persistRoot(id, { ...root, entries });
  }

  async removeEntry(id: string, entryId: string): Promise<GlossaryResponseDto> {
    const glossary = await this.findRawOrThrow(id);
    const root = GlossariesService.parseRoot(glossary.allGlossRules);
    const index = root.entries.findIndex((existing) => GlossariesService.sameId(existing, entryId));

    if (index === -1) {
      throw new NotFoundException(`Entry "${entryId}" not found in glossary "${id}"`);
    }

    if (root.entries.length === 1) {
      // БД-обмеження glossaries_rules_has_entries вимагає непорожній
      // масив — перевіряємо це тут заздалегідь, а не ловимо сиру
      // помилку constraint violation з Postgres.
      throw new ConflictException(
        `Cannot remove the last entry of glossary "${id}": a glossary must keep at least one entry`,
      );
    }

    const entries = root.entries.filter((_, i) => i !== index);
    return this.persistRoot(id, { ...root, entries });
  }

  private async findRawOrThrow(id: string): Promise<{ id: string; allGlossRules: unknown }> {
    const glossary = await this.prisma.glossary.findUnique({
      where: { id },
      select: { id: true, allGlossRules: true },
    });

    if (!glossary) {
      throw new NotFoundException(`Glossary "${id}" not found`);
    }

    return glossary;
  }

  private async persistRoot(id: string, root: GlossaryRoot): Promise<GlossaryResponseDto> {
    const glossary = await this.prisma.glossary.update({
      where: { id },
      data: { allGlossRules: root as Prisma.InputJsonValue },
    });

    return glossary;
  }

  private static parseRoot(value: unknown): GlossaryRoot {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException('Glossary allGlossRules is not a JSON object');
    }

    const root = value as Record<string, unknown>;
    if (!Array.isArray(root.entries)) {
      throw new BadRequestException('Glossary allGlossRules has no "entries" array');
    }

    return root as GlossaryRoot;
  }

  /**
   * Мінімальна структурна перевірка перед тим, як allGlossRules піде в БД
   * при СТВОРЕННІ нового глосарія — тут немає "поточного" entries, яке
   * можна було б підставити замість переданого, тому вимагаємо його явно.
   * (У update() цю роль тепер виконує підстановка поточного entries з БД —
   * дивись коментар там.)
   */
  private static assertHasEntriesArray(value: Record<string, unknown>): void {
    if (!Array.isArray(value.entries)) {
      throw new BadRequestException(
        'allGlossRules must contain an "entries" array — use PATCH /glossaries/:id/entries/:entryId ' +
          'to edit a single term instead of resending allGlossRules without it',
      );
    }
  }

  private static requireEnglishTerm(entry: Record<string, unknown>): string {
    const value = entry.english_term;
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Entry must have a non-empty "english_term" string field');
    }

    return value;
  }

  private static sameId(entry: unknown, entryId: string): boolean {
    if (typeof entry !== 'object' || entry === null) {
      return false;
    }

    return (entry as Record<string, unknown>).id === entryId;
  }
}
