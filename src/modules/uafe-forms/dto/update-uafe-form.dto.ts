import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsObject } from "class-validator";

export class UpdateUafeFormDto {
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Contenido completo del formulario (UafeFormData).",
  })
  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;
}
