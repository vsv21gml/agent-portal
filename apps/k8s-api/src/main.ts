import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { AppModule } from "./app.module";

const rootEnvPath = path.resolve(__dirname, "../../..", ".env");
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("K8sApiBootstrap");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 4300);
  await app.listen(port);
  logger.log(`k8s-api listening on port ${port}`);
}

void bootstrap();
