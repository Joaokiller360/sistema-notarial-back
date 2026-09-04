import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationDto } from "../../../common/utils/pagination.util";

export class GetUsersDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Buscar por email, nombre o apellido" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
