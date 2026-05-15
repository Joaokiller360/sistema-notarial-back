import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from "class-validator";
import { NotificationType } from "./create-notification.dto";

export class NotificationQueryDto {
  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  read?: boolean;

  @ApiPropertyOptional({ example: "2026-05-01" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from debe tener formato YYYY-MM-DD" })
  from?: string;

  @ApiPropertyOptional({ example: "2026-05-31" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to debe tener formato YYYY-MM-DD" })
  to?: string;
}
