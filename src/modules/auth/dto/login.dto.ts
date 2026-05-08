import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@notaria.com" })
  @IsEmail({}, { message: "Email inválido" })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: "Admin123!" })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
