import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class UnlockAccountDto {
  @ApiProperty({ description: "ID del usuario cuya cuenta se desbloquea" })
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
