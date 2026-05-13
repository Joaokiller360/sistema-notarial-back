import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export class UpdateSystemConfigDto {
  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxPdfSizeMb?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  maxPdfImages?: number;

  @ApiPropertyOptional({
    example: "1.0.0",
    maxLength: 30,
    description: "Versión del sistema mostrada en el footer. Solo letras, números, puntos, guiones y guiones bajos.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9.\-_]+$/, {
    message: "systemVersion solo puede contener letras, números, puntos, guiones y guiones bajos",
  })
  systemVersion?: string;
}
