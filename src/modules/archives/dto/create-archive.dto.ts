import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export enum ArchiveType {
  P = "P",
  D = "D",
  A = "A",
  C = "C",
  O = "O",
}

export const ARCHIVE_TYPE_LABELS: Record<ArchiveType, string> = {
  [ArchiveType.P]: "Protocolos",
  [ArchiveType.D]: "Diligencias",
  [ArchiveType.A]: "Arrendamientos",
  [ArchiveType.C]: "Certificaciones",
  [ArchiveType.O]: "Otros",
};

export class GrantorDto {
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
  @IsNotEmpty({ message: "La cédula o RUC es requerido" })
  @IsString()
  @MinLength(10)
  @MaxLength(13)
  cedulaORuc?: string;

  @ApiPropertyOptional({
    example: "AB123456",
    description: "Número de pasaporte (alfanumérico, 5–20 caracteres). Requerido si es_pasaporte=true",
  })
  @ValidateIf((o) => o.es_pasaporte === true)
  @IsNotEmpty({ message: "El número de pasaporte es requerido cuando es_pasaporte es true" })
  @IsString()
  pasaporte?: string;

  @ApiProperty({ example: "Ecuatoriana" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nacionalidad: string;
}

export class BeneficiaryDto {
  @ApiProperty({ example: "María Elena Torres Vega" })
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
    example: "1798765432",
    description: "Cédula (10 dígitos) o RUC (13 dígitos). Ignorado si es_pasaporte=true",
  })
  @ValidateIf((o) => !o.es_pasaporte)
  @IsNotEmpty({ message: "La cédula o RUC es requerido" })
  @IsString()
  @MinLength(10)
  @MaxLength(13)
  cedulaORuc?: string;

  @ApiPropertyOptional({
    example: "CD789012",
    description: "Número de pasaporte (alfanumérico, 5–20 caracteres). Requerido si es_pasaporte=true",
  })
  @ValidateIf((o) => o.es_pasaporte === true)
  @IsNotEmpty({ message: "El número de pasaporte es requerido cuando es_pasaporte es true" })
  @IsString()
  pasaporte?: string;

  @ApiProperty({ example: "Colombiana" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nacionalidad: string;
}

export class CreateArchiveDto {
  @ApiProperty({ example: "ESC-2024-001", maxLength: 17 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(17)
  @MinLength(3)
  code: string;

  @ApiProperty({
    enum: ArchiveType,
    description: "P=Protocolos, D=Diligencias, A=Arrendamientos, C=Certificaciones, O=Otros",
    example: ArchiveType.P,
  })
  @IsEnum(ArchiveType)
  type: ArchiveType;

  @ApiPropertyOptional({ example: "Escritura de compraventa de bien inmueble" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @ApiPropertyOptional({
    example: "2024-03-15",
    description: "Fecha del documento/escritura (ISO 8601)",
  })
  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @ApiProperty({ type: [GrantorDto], description: "Lista de otorgantes" })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GrantorDto)
  grantors: GrantorDto[];

  @ApiProperty({
    type: [BeneficiaryDto],
    description: "Lista de beneficiarios (a favor de)",
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryDto)
  beneficiaries: BeneficiaryDto[];
}
