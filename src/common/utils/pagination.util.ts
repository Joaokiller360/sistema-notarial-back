import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface PaginatedResult<T> {
  data:  T[];
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export function paginate<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return {
    data,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export function getPrismaSkipTake(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}
