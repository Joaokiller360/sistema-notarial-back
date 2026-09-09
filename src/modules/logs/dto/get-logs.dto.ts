import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationDto } from "../../../common/utils/pagination.util";

export class GetLogsDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Filtrar por ID de usuario" })
  @IsOptional()
  @IsUUID("4")
  userId?: string;

  @ApiPropertyOptional({ description: "Filtrar por acción (contiene, case-insensitive)" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    description: "Rango: desde (ISO 8601). Filtra por createdAt >= startDate.",
    example: "2026-09-01T00:00:00.000Z",
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: "Rango: hasta (ISO 8601). Filtra por createdAt <= endDate.",
    example: "2026-09-09T23:59:59.999Z",
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
