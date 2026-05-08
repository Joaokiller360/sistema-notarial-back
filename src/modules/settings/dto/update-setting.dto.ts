import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UpdateSettingDto {
  @ApiProperty({
    example: "Notaria Principal",
    description: "Valor de la configuración",
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class BulkUpdateSettingsDto {
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string" },
    example: { system_name: "Mi Notaria", logo_url: "/uploads/logo.png" },
  })
  settings: Record<string, string>;
}
