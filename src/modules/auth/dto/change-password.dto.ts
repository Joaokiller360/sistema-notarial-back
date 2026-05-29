import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from "class-validator";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
const PASSWORD_MESSAGE =
  "La contraseña debe tener al menos 1 mayúscula, 1 número y 1 carácter especial";

export class ChangePasswordDto {
  @ApiProperty({ description: "Contraseña actual" })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: "Nueva contraseña (min 8 chars, mayúscula, número, especial)",
  })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: "ID del usuario a resetear" })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description:
      "Nueva contraseña temporal (si omite, se genera automáticamente con crypto.randomBytes)",
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword?: string;
}
