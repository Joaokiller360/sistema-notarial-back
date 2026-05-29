import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

// Exhaustive allowlist of setting keys this system accepts.
// Adding a new system setting requires adding it here.
export const ALLOWED_SETTING_KEYS = new Set([
  "system_name",
  "system_version",
  "logo_url",
  "footer_text",
  "max_pdf_size_mb",
  "max_pdf_images",
  "maintenance_mode",
  "contact_email",
  "contact_phone",
  "address",
]) as ReadonlySet<string>;

export class UpdateSettingDto {
  @ApiProperty({
    example: "Notaria Principal",
    description: "Valor de la configuración (máx. 500 caracteres)",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  value: string;
}

export class BulkUpdateSettingsDto {
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string", maxLength: 500 },
    example: { system_name: "Mi Notaria", footer_text: "© 2026" },
    description: `Claves permitidas: ${[...ALLOWED_SETTING_KEYS].join(", ")}`,
  })
  settings: Record<string, string>;
}
