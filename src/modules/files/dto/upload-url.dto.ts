import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UploadUrlDto {
  @ApiProperty({
    example: "contrato-compraventa.pdf",
    description: "Nombre original del archivo (se usará para generar la key en S3)",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @ApiProperty({
    example: "application/pdf",
    description: "MIME type del archivo",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contentType: string;
}
