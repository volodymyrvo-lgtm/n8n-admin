export class JobErrorResponseDto {
  id!: string;
  jobId!: string;
  /** Довільний JSON — рівно те, що надіслав n8n. */
  error!: unknown;
  createdAt!: Date;
}

export class PaginatedJobErrorsResponseDto {
  items!: JobErrorResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
