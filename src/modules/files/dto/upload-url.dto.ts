import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

// Strict allowlist — only PDF for notarial documents
const ALLOWED_MIME_TYPES = ["application/pdf"] as const;

export class UploadUrlDto {
  @ApiProperty({
    example: "contrato-compraventa.pdf",
    description: "Nombre original del archivo — debe tener extensión .pdf",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  // Enforce .pdf extension in the filename to prevent double-extension attacks
  @Matches(/^[^<>:"/\\|?*\x00-\x1f]+\.pdf$/i, {
    message: "El nombre de archivo debe terminar en .pdf y no contener caracteres inválidos",
  })
  filename: string;

  @ApiProperty({
    example: "application/pdf",
    description: "MIME type del archivo — solo application/pdf permitido",
    enum: ALLOWED_MIME_TYPES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: `Solo se permiten los tipos: ${ALLOWED_MIME_TYPES.join(", ")}`,
  })
  contentType: string;
}
