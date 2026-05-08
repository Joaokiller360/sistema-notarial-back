import { NestFactory, Reflector } from "@nestjs/core";
import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import helmet from "helmet";
import * as compression from "compression";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  const reflector = app.get(Reflector);

  // Use Winston logger for NestJS internal logs
  app.useLogger(logger);

  // ─── API PREFIX ─────────────────────────────────────────────────────────────
  const apiPrefix = config.get<string>("app.apiPrefix") || "api/v1";
  app.setGlobalPrefix(apiPrefix);

  // ─── SECURITY ───────────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow PDF serving
    }),
  );
  app.use(compression());

  // CORS
  const corsOrigins = config.get<string[]>("app.corsOrigins") || [
    "http://localhost:3000",
  ];
  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  // ─── GLOBAL GUARDS ──────────────────────────────────────────────────────────
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new PermissionsGuard(reflector),
  );

  // ─── GLOBAL PIPES ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── GLOBAL FILTERS ─────────────────────────────────────────────────────────
  app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());

  // ─── GLOBAL INTERCEPTORS ────────────────────────────────────────────────────
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ClassSerializerInterceptor(reflector),
    new TransformInterceptor(),
  );

  // ─── SWAGGER / OPENAPI ──────────────────────────────────────────────────────
  if (config.get<string>("app.nodeEnv") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Notaria Sistema API")
      .setDescription("Sistema de gestión de archivos notariales — API REST")
      .setVersion(config.get<string>("app.systemVersion") || "1.0.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT", in: "header" },
        "JWT",
      )
      .addTag("Auth", "Autenticación y gestión de sesiones")
      .addTag("Users", "Gestión de usuarios")
      .addTag("Roles", "Gestión de roles")
      .addTag("Permissions", "Gestión de permisos")
      .addTag("Archives", "Archivos notariales")
      .addTag("Logs", "Logs del sistema")
      .addTag("Settings", "Configuraciones del sistema")
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: "alpha",
        operationsSorter: "alpha",
      },
    });

    logger.log(
      `Swagger docs: http://localhost:${config.get("app.port")}/${apiPrefix}/docs`,
      "Bootstrap",
    );
  }

  // ─── STATIC FILES (PDFs) ────────────────────────────────────────────────────
  const uploadDest = config.get<string>("upload.dest") || "./uploads";
  const express = require("express");
  app.use("/uploads", express.static(uploadDest));

  // ─── START ──────────────────────────────────────────────────────────────────
  const port = config.get<number>("app.port") || 3000;
  await app.listen(port);

  logger.log(
    `Application running on: http://localhost:${port}/${apiPrefix}`,
    "Bootstrap",
  );
}

bootstrap();
