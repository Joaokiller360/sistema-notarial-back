import { NestFactory, Reflector } from "@nestjs/core";
import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import helmet from "helmet";
import compression from "compression";
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

  app.useLogger(logger);

  const isProduction = config.get<string>("app.nodeEnv") === "production";

  // ─── API PREFIX ─────────────────────────────────────────────────────────────
  const apiPrefix = config.get<string>("app.apiPrefix") || "api/v1";
  app.setGlobalPrefix(apiPrefix);

  // ─── TRUST PROXY (set when behind Nginx / Cloudflare) ───────────────────────
  // Required for correct IP in rate limiting and logging when behind a reverse proxy
  if (isProduction) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  // ─── CORS ───────────────────────────────────────────────────────────────────
  // Must be registered before Helmet so OPTIONS preflight is handled first
  const corsOrigins = config.get<string[]>("app.corsOrigins") || [
    "http://localhost:3000",
  ];
  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  // ─── SECURITY HEADERS (Helmet) ───────────────────────────────────────────────
  app.use(
    helmet({
      // Content-Security-Policy: strict — blocks XSS, clickjacking, mixed content
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https://*.amazonaws.com"],
          connectSrc: [
            "'self'",
            "https://developer.joaobarres.dev",
            "https://*.joaobarres.dev",
            "https://*.amazonaws.com",
          ],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          ...(isProduction && { upgradeInsecureRequests: [] }),
        },
      },
      // HSTS: force HTTPS for 1 year
      strictTransportSecurity: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      // Prevent embedding in iframes (clickjacking)
      frameguard: { action: "deny" },
      // CORP: same-site (stricter than cross-origin; overridden per-route for S3 redirects)
      crossOriginResourcePolicy: { policy: "same-site" },
      crossOriginEmbedderPolicy: false, // Allow S3 presigned redirects
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // ─── COMPRESSION ────────────────────────────────────────────────────────────
  // Disabled on auth endpoints (BREACH mitigation) — see filter function
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path.includes("/auth/")) return false;
        return compression.filter(req, res);
      },
    }),
  );

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
      // Disable implicit type coercion to prevent bypass via type confusion
      transformOptions: { enableImplicitConversion: false },
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

  // ─── SWAGGER (development + staging only) ───────────────────────────────────
  if (!isProduction) {
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

  // ─── NOTE: /uploads static endpoint intentionally removed ───────────────────
  // PDF files are served via authenticated GET /archives/:id/pdf which generates
  // a signed S3 URL. No unauthenticated static file access is allowed.

  // ─── START ──────────────────────────────────────────────────────────────────
  const port = config.get<number>("app.port") || 3000;
  await app.listen(port, "0.0.0.0");

  logger.log(
    `Application running on port ${port} [${config.get("app.nodeEnv")}]`,
    "Bootstrap",
  );
}

bootstrap();
