import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { sanitizeInput } from "../../../common/utils/validators.util";

export class CreateNotaryDto {
  @ApiProperty({ example: "Notaría Pública Central", maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.]+$/, {
    message: "notaryName solo puede contener letras, espacios y puntos",
  })
  @Transform(({ value }) => sanitizeInput(value))
  notaryName: string;

  @ApiProperty({ example: 42 })
  @IsInt({ message: "notaryNumber debe ser un entero" })
  @Min(1)
  @Max(99999)
  notaryNumber: number;

  @ApiProperty({ example: "Juan Carlos Pérez", maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.]+$/, {
    message: "notaryOfficerName solo puede contener letras, espacios y puntos",
  })
  @Transform(({ value }) => sanitizeInput(value))
  notaryOfficerName: string;
}
