import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
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
}
