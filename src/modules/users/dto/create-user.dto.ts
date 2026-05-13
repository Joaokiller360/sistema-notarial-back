import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

function sanitizeName({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"';&#\/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class CreateUserDto {
  @ApiProperty({ example: "juan.perez@notaria.com" })
  @IsEmail({}, { message: "Email inválido" })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: "Juan" })
  @Transform(sanitizeName)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60, { message: "Máximo 60 caracteres permitidos" })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s'\-]+$/, {
    message: "Solo se permiten letras, tildes, espacios y guiones",
  })
  firstName: string;

  @ApiProperty({ example: "Pérez" })
  @Transform(sanitizeName)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60, { message: "Máximo 60 caracteres permitidos" })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s'\-]+$/, {
    message: "Solo se permiten letras, tildes, espacios y guiones",
  })
  lastName: string;

  @ApiProperty({ example: "Seguro123!" })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      "La contraseña requiere al menos 1 mayúscula, 1 número y 1 carácter especial",
  })
  password: string;

  @ApiPropertyOptional({
    type: [String],
    description: "IDs de roles a asignar",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
