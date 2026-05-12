import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateClientDto {
  @ApiProperty({ example: "Juan Carlos Pérez López" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombresCompletos: string;

  @ApiPropertyOptional({
    example: false,
    description: "true = identificar con pasaporte; false/omitido = cédula o RUC",
  })
  @IsOptional()
  @IsBoolean()
  es_pasaporte?: boolean;

  @ApiPropertyOptional({
    example: "1712345678",
    description: "Cédula (10 dígitos) o RUC (13 dígitos). Ignorado si es_pasaporte=true",
  })
  @ValidateIf((o) => !o.es_pasaporte)
  @IsOptional()
  @IsString()
  cedulaORuc?: string;

  @ApiPropertyOptional({
    example: "AB123456",
    description: "Número de pasaporte (alfanumérico, 5–20 caracteres). Requerido si es_pasaporte=true",
  })
  @ValidateIf((o) => o.es_pasaporte === true)
  @IsNotEmpty({ message: "El número de pasaporte es requerido cuando es_pasaporte es true" })
  @IsString()
  pasaporte?: string;

  @ApiPropertyOptional({ example: "Ecuatoriana" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nacionalidad?: string;
}

export class BulkCreateClientsDto {
  @ApiProperty({ type: [CreateClientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientDto)
  clients: CreateClientDto[];
}
