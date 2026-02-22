import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/decorators/public.decorator";

@Controller()
export class AppController {
  @Public()
  @Get("health")
  health() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
