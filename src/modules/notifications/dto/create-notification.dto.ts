import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";

export enum NotificationType {
  INFORMATIVA = "INFORMATIVA",
  URGENTE = "URGENTE",
  RECORDATORIO = "RECORDATORIO",
  ALERTA = "ALERTA",
}

export class CreateNotificationDto {
  @ApiProperty({ example: "uuid-or-ALL", description: 'UUID del destinatario o "ALL"' })
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;
}
