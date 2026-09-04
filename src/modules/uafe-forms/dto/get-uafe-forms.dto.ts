import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationDto } from "../../../common/utils/pagination.util";

export const NIVEL_RIESGO_VALUES = ["bajo", "medio", "alto", "critico"] as const;

export class GetUafeFormsDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      "Texto libre: compareciente (nombre/identificación) o quien llenó el formulario",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: "Nombre del país del compareciente" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nacionalidad?: string;

  @ApiPropertyOptional({ enum: NIVEL_RIESGO_VALUES })
  @IsOptional()
  @IsIn(NIVEL_RIESGO_VALUES)
  nivelRiesgo?: string;
}
