import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Required for Shopify webhook HMAC validation
  });

  // Serve static files from public/meal-photos
  const publicDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(path.join(publicDir, 'meal-photos'), { recursive: true });
  app.useStaticAssets(publicDir);

  // Increase body size limit to allow base64-encoded meal images (up to ~10 MB)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (origin, callback) => {
      // Allow any localhost port in development, or match FRONTEND_URL in production
      const allowed = process.env.FRONTEND_URL;
      if (!origin || (allowed ? origin === allowed : /^http:\/\/localhost:\d+$/.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Culinary Ops API running on port ${port}`);
}

bootstrap();
