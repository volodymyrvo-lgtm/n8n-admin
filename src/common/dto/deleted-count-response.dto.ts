/** Відповідь масових видалень (DELETE /jobs, DELETE /banners). */
export class DeletedCountResponseDto {
  /** Скільки записів видалено. */
  deletedCount!: number;
}
