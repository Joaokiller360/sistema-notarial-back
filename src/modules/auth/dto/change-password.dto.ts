import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'Nueva contraseña (min 8 chars, mayúscula, número, especial)' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'La contraseña debe tener al menos 1 mayúscula, 1 número y 1 carácter especial',
  })
  newPassword: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'ID del usuario a resetear' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ description: 'Nueva contraseña temporal (si omite, se genera automáticamente)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
