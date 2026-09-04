import { ApiProperty } from "@nestjs/swagger";

export class AuthTokensDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty() expiresIn: number;
}

export class AuthUserDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ type: [String] }) roles: string[];
  @ApiProperty({ type: [String] }) permissions: string[];
  @ApiProperty({
    description:
      "true = el usuario no puede descargar/imprimir PDF de archivos",
  })
  pdfDownloadDisabled: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ type: AuthTokensDto }) tokens: AuthTokensDto;
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
}
