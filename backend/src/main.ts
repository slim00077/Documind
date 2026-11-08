import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS_ORIGIN: comma-separated allowed origins in production; open in local dev.
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors(corsOrigin?.length ? { origin: corsOrigin } : undefined);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // SIGTERM from Render / Kubernetes / docker stop: close HTTP and the database pool cleanly.
  app.enableShutdownHooks();

  // Render, Docker and Kubernetes inject PORT. listen() without a host binds every interface.
  const PORT = Number(process.env.PORT ?? 3000);

  await app.listen(PORT);
  console.log(`Server running on http://localhost:${PORT}`);
}

bootstrap();
