import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min } from "class-validator";

export class UpdateSystemConfigDto {
  @ApiProperty({ example: 10, minimum: 1, maximum: 500 })
  @IsInt()
  @Min(1)
  @Max(500)
  maxPdfSizeMb: number;
}
