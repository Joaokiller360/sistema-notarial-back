import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationDto } from "../../../common/utils/pagination.util";

export class GetClientsDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Buscar por nombre o cédula/RUC" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
