import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { LogsService } from "./logs.service";

type ReqWithUser = Request & { user?: JwtPayload };

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logsService: LogsService) {}

  use(req: ReqWithUser, res: Response, next: NextFunction): void {
    const started = Date.now();
    const userId = req.user?.sub ?? null;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      this.logsService
        .writeAuditLog({
          userId,
          method: req.method,
          path: req.path,
          requestBody: req.body ? JSON.stringify(req.body) : null,
        })
        .catch(() => undefined);
    }

    res.on("finish", () => {
      this.logsService
        .writeAccessLog({
          userId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          elapsedMs: Date.now() - started,
        })
        .catch(() => undefined);
    });

    next();
  }
}
