import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";

export class CreateUafeFormDto {
  @ApiProperty({ example: "uafe-principal" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateId: string;

  @ApiProperty({ example: "UAFE — Conozca a su cliente" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  templateName: string;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description:
      "Contenido completo del formulario (UafeFormData). Las imágenes de comprobantes NO viajan aquí — usar POST /uafe-forms/:id/comprobantes.",
  })
  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;
}
