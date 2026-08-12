"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = require("@fastify/helmet");
const compress_1 = require("@fastify/compress");
const static_1 = require("@fastify/static");
const multipart_1 = require("@fastify/multipart");
const path = require("path");
const fs = require("fs");
const app_module_1 = require("./app.module");
const global_exception_filter_1 = require("./common/filters/global-exception.filter");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const logger_util_1 = require("./common/utils/logger.util");
async function bootstrap() {
    const logger = (0, logger_util_1.createLogger)('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({ logger: false }), { bufferLogs: true, rawBody: true });
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('app.port', 3001);
    const apiPrefix = configService.get('app.apiPrefix', 'api');
    const nodeEnv = configService.get('app.nodeEnv', 'development');
    const corsOriginEnv = configService.get('app.corsOrigin', '');
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4001',
        configService.get('app.frontendUrl', 'http://localhost:3000'),
        ...(corsOriginEnv ? corsOriginEnv.split(',').map(s => s.trim()) : []),
    ];
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin)
                return callback(null, true);
            if (allowedOrigins.includes(origin))
                return callback(null, true);
            const isPrivate = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
            if (isPrivate)
                return callback(null, true);
            callback(new Error(`CORS: origin ${origin} not allowed`), false);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        credentials: true,
    });
    await app.register(multipart_1.default, {
        limits: {
            fileSize: 100 * 1024 * 1024,
            files: 10,
        },
    });
    await app.register(static_1.default, {
        root: path.join(__dirname, '..', 'static', 'token-audio'),
        prefix: `/${apiPrefix}/token/audio/`,
        decorateReply: false,
    });
    const uploadDir = path.join(__dirname, '..', 'uploads', 'display-media');
    fs.mkdirSync(uploadDir, { recursive: true });
    await app.register(static_1.default, {
        root: uploadDir,
        prefix: '/uploads/display-media/',
        decorateReply: false,
    });
    await app.register(compress_1.default, {
        encodings: ['gzip', 'deflate'],
        threshold: 1024,
    });
    await app.register(helmet_1.default, {
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:'],
                mediaSrc: ["'self'"],
            },
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    });
    app.setGlobalPrefix(apiPrefix);
    app.enableVersioning({ type: common_1.VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter());
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor());
    if (nodeEnv !== 'production') {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('HDSP API')
            .setDescription('Hospital Digital Services Platform - REST API')
            .setVersion('1.0')
            .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    }
    await app.listen(port, '0.0.0.0');
    logger.info(`Server running on http://0.0.0.0:${port}`);
    logger.info(`API prefix: /${apiPrefix}/v1`);
    logger.info(`Environment: ${nodeEnv}`);
}
bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map