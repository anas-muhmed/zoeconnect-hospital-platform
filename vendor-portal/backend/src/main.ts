import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4001',
    credentials: true,
  });

  const port = parseInt(process.env.PORT ?? '4000');
  await app.listen(port, '0.0.0.0');
  console.log(`Vendor Portal API running on port ${port}`);
  console.log(`Vendor Portal API running on port ${port}`);
}

bootstrap();
"// touch: force vendor_backend rebuild to the ship health module (2026-08)."
"// touch: break stale vendor_backend tag chain,, force rebuild under fixed manifest-fetch logic (2026-08)" 
