import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

function sanitizeName({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"';&#\/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: "Juan" })
  @IsOptional()
  @Transform(sanitizeName)
  @IsString()
  @MinLength(2)
  @MaxLength(60, { message: "Máximo 60 caracteres permitidos" })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s'\-]+$/, {
    message: "Solo se permiten letras, tildes, espacios y guiones",
  })
  firstName?: string;

  @ApiPropertyOptional({ example: "Pérez" })
  @IsOptional()
  @Transform(sanitizeName)
  @IsString()
  @MinLength(2)
  @MaxLength(60, { message: "Máximo 60 caracteres permitidos" })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s'\-]+$/, {
    message: "Solo se permiten letras, tildes, espacios y guiones",
  })
  lastName?: string;
}
