import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { AppModule } from "./app.module";
import { AuthService } from "./auth/auth.service";

const rootEnvPath = path.resolve(__dirname, "../../..", ".env");
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const authService = app.get(AuthService);
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  logger.log(`Starting API bootstrap (nodeEnv=${process.env.NODE_ENV ?? "development"}, port=${process.env.PORT ?? 4000})`);
  logger.log(`K8S integration flags workspace=${process.env.K8S_WORKSPACE_ENABLED ?? "false"}`);
  const result = await authService.ensureInitialAdmin(adminEmail, adminPassword);
  if (result.created && result.password) {
    console.log(`[agent-portal] Initial admin created: ${adminEmail}`);
    console.log(`[agent-portal] Initial admin password: ${result.password}`);
  } else if (result.created) {
    console.log(`[agent-portal] Initial admin created: ${adminEmail}`);
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

void bootstrap();
