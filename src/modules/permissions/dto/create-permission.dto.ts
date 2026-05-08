import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class CreatePermissionDto {
  @ApiProperty({
    example: "archives:export",
    description: "Nombre único (formato acción:recurso)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z-]+:[a-z-]+$/, {
    message:
      "El nombre debe tener formato acción:recurso (ej: create:archives)",
  })
  name: string;

  @ApiProperty({ example: "export", description: "Acción que se permite" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  action: string;

  @ApiProperty({
    example: "archives",
    description: "Recurso sobre el que aplica",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  resource: string;

  @ApiPropertyOptional({ example: "Exportar archivos notariales a PDF" })
  @IsOptional()
  @IsString()
  description?: string;
}
