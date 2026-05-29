import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ServerSideEncryption,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

export interface ImageUploadResult {
  url: string;
  rotated: boolean;
  original_orientation: "landscape" | "portrait";
  final_dimensions: { width: number; height: number };
}

// Abort S3 operations that stall longer than this to prevent event-loop blocking
const S3_TIMEOUT_MS = 30_000;

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET!;
  }

  async uploadPdf(buffer: Buffer): Promise<string> {
    const key = `pdfs/${uuidv4()}.pdf`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: "application/pdf",
          // Force download; prevents browsers from rendering PDFs inline
          ContentDisposition: "attachment",
          // Encrypt at rest using S3-managed keys
          ServerSideEncryption: ServerSideEncryption.AES256,
        }),
        { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) },
      );
    } catch (err) {
      this.logger.error("S3 PDF upload failed", err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException("Error al procesar el archivo PDF");
    }
    return key;
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 600,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: ServerSideEncryption.AES256,
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (err) {
      this.logger.error("S3 presigned upload URL generation failed", err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException("Error al generar URL de carga");
    }
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Force download; prevents inline execution of PDFs in browser
        ResponseContentDisposition: "attachment",
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (err) {
      this.logger.error("S3 presigned view URL generation failed", err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException("Error al generar URL de visualización");
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) },
      );
    } catch (err) {
      this.logger.error("S3 delete failed", err instanceof Error ? err.stack : err);
      // Non-critical — log but don't throw (file may already be gone)
    }
  }

  async uploadImage(buffer: Buffer, mimeType: string): Promise<ImageUploadResult> {
    const { buffer: processedBuffer, rotated, original_orientation, final_dimensions } =
      await this.processImage(buffer, mimeType);

    const ext = (
      { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>
    )[mimeType] ?? "bin";
    const key = `news/${uuidv4()}.${ext}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: processedBuffer,
          ContentType: mimeType,
          ServerSideEncryption: ServerSideEncryption.AES256,
        }),
        { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) },
      );
    } catch (err) {
      this.logger.error("S3 image upload failed", err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException("Error al subir la imagen");
    }

    const baseUrl =
      process.env.S3_BASE_URL ||
      `https://${this.bucket}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com`;

    return {
      url: `${baseUrl}/${key}`,
      rotated,
      original_orientation,
      final_dimensions,
    };
  }

  private async processImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{
    buffer: Buffer;
    rotated: boolean;
    original_orientation: "landscape" | "portrait";
    final_dimensions: { width: number; height: number };
  }> {
    const formatMap: Record<string, keyof sharp.FormatEnum> = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const format = formatMap[mimeType] ?? "jpeg";

    const meta = await sharp(buffer).metadata();
    const rawWidth = meta.width ?? 0;
    const rawHeight = meta.height ?? 0;
    const original_orientation: "landscape" | "portrait" =
      rawWidth > rawHeight ? "landscape" : "portrait";

    const { data: exifFixed, info: exifInfo } = await sharp(buffer)
      .rotate()
      .toFormat(format)
      .toBuffer({ resolveWithObject: true });

    let rotated = exifInfo.width !== rawWidth || exifInfo.height !== rawHeight;
    let finalBuffer = exifFixed;
    let finalWidth = exifInfo.width;
    let finalHeight = exifInfo.height;

    if (finalWidth > finalHeight) {
      const { data: cwFixed, info: cwInfo } = await sharp(exifFixed)
        .rotate(90)
        .toFormat(format)
        .toBuffer({ resolveWithObject: true });
      finalBuffer = cwFixed;
      finalWidth = cwInfo.width;
      finalHeight = cwInfo.height;
      rotated = true;
    }

    return {
      buffer: finalBuffer,
      rotated,
      original_orientation,
      final_dimensions: { width: finalWidth, height: finalHeight },
    };
  }
}
