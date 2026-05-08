import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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

  @ApiProperty({
    example: "1712345678",
    description: "Cédula (10 dígitos) o RUC (13 dígitos)",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(13)
  cedulaORuc: string;

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

  @ApiProperty({ example: "1798765432" })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(13)
  cedulaORuc: string;

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

  @ApiProperty({ type: [GrantorDto], description: "Lista de otorgantes" })
  @IsArray()
  @ArrayMinSize(1, { message: "Debe haber al menos un otorgante" })
  @ValidateNested({ each: true })
  @Type(() => GrantorDto)
  grantors: GrantorDto[];

  @ApiProperty({
    type: [BeneficiaryDto],
    description: "Lista de beneficiarios (a favor de)",
  })
  @IsArray()
  @ArrayMinSize(1, { message: "Debe haber al menos un beneficiario" })
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryDto)
  beneficiaries: BeneficiaryDto[];
}
