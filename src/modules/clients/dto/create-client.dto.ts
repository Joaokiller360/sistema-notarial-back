import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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
    example: "1712345678",
    description: "Cédula (10 dígitos) o RUC (13 dígitos)",
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(13)
  cedulaORuc?: string;

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
