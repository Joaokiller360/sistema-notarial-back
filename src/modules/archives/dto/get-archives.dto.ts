import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationDto } from "../../../common/utils/pagination.util";
import { ArchiveType } from "./create-archive.dto";

export class GetArchivesDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Buscar por código u observaciones" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ArchiveType })
  @IsOptional()
  @IsEnum(ArchiveType)
  type?: ArchiveType;
}
