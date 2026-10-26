/**
 * Папка Customer.io. `id` — це id самої папки в Customer.io (саме його
 * треба передавати в Customer.io), внутрішній uuid рядка в БД не віддається.
 */
export class CustomerFolderResponseDto {
  id!: number;
  name!: string;
  /** id батьківської папки; null — папка верхнього рівня. */
  parentId!: number | null;
  /** Дати створення й зміни в Customer.io. */
  createdAt!: Date;
  updatedAt!: Date;
}

export class CustomerFoldersListResponseDto {
  /** Плоский список, відсортований за назвою; дерево фронт будує за parentId. */
  items!: CustomerFolderResponseDto[];
  total!: number;
}
