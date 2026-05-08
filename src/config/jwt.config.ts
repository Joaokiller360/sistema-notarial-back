import { registerAs } from "@nestjs/config";

export default registerAs("jwt", () => ({
  accessSecret:
    process.env.JWT_ACCESS_SECRET || "default_access_secret_change_in_prod",
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || "15m",
  refreshSecret:
    process.env.JWT_REFRESH_SECRET || "default_refresh_secret_change_in_prod",
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || "7d",
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),
}));
