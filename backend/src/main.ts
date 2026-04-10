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
      // Allow any localhost port in development. In production, accept any
      // origin listed in FRONTEND_URLS (comma-separated) or the legacy
      // FRONTEND_URL env var, plus any *.vercel.app preview URL.
      // Multi-origin support is needed because the marketing site, admin
      // dashboard, and customer webapp may run on different hostnames but
      // all talk to the same API.
      const allowList = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const isLocalhost = origin && /^http:\/\/localhost:\d+$/.test(origin);
      const isVercel = origin && /\.vercel\.app$/.test(origin);
      const isAllowed = !origin || isLocalhost || isVercel || allowList.includes(origin);

      if (isAllowed) {
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
