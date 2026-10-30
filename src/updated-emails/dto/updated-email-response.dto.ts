export class UpdatedEmailResponseDto {
  id!: string;
  emailId!: string;
  /** HTML листа. */
  body!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/** Елемент списку: без body, бо HTML може важити мегабайти. Сам HTML віддає GET /updated-emails/:id. */
export class UpdatedEmailListItemDto {
  id!: string;
  emailId!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PaginatedUpdatedEmailsResponseDto {
  items!: UpdatedEmailListItemDto[];
  /** Кількість листів, що відповідають фільтрам (не загальна кількість у системі). */
  total!: number;
  page!: number;
  limit!: number;
}
