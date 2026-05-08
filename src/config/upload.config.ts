import { registerAs } from "@nestjs/config";

export default registerAs("upload", () => ({
  dest: process.env.UPLOAD_DEST || "./uploads",
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760", 10), // 10MB
  allowedMimeTypes: ["application/pdf"],
}));
