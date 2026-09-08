import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class ForceLogoutDto {
  @ApiProperty({
    description: "ID del usuario cuya sesión activa se cierra a la fuerza",
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
