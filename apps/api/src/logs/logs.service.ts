import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../auth/entities/user.entity";
import { AccessLogEntity } from "./entities/access-log.entity";
import { AuditLogEntity } from "./entities/audit-log.entity";

type AuditInput = {
  userId: string | null;
  method: string;
  path: string;
  requestBody: string | null;
};

type AccessInput = {
  userId: string | null;
  clientIp: string | null;
  method: string;
  path: string;
  statusCode: number;
  elapsedMs: number;
};

type AccessLogView = AccessLogEntity & {
  userEmail: string | null;
};

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepository: Repository<AuditLogEntity>,
    @InjectRepository(AccessLogEntity)
    private readonly accessRepository: Repository<AccessLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async writeAuditLog(input: AuditInput): Promise<void> {
    try {
      await this.auditRepository.save(this.auditRepository.create(input));
    } catch (error) {
      this.logger.warn(`Failed to persist audit log for ${input.method} ${input.path}: ${this.describeError(error)}`);
    }
  }

  async writeAccessLog(input: AccessInput): Promise<void> {
    try {
      await this.accessRepository.save(this.accessRepository.create(input));
    } catch (error) {
      this.logger.warn(`Failed to persist access log for ${input.method} ${input.path}: ${this.describeError(error)}`);
    }
  }

  listAuditLogs(): Promise<AuditLogEntity[]> {
    return this.auditRepository.find({ order: { createdAt: "DESC" }, take: 200 });
  }

  async listAccessLogs(): Promise<AccessLogView[]> {
    const rows = await this.accessRepository.find({ order: { createdAt: "DESC" }, take: 200 });
    const userIds = Array.from(new Set(rows.map((row) => row.userId).filter((value): value is string => Boolean(value))));
    const users = userIds.length ? await this.userRepository.findBy(userIds.map((id) => ({ id }))) : [];
    const userMap = new Map(users.map((user) => [user.id, user.email]));
    return rows.map((row) => ({
      ...row,
      userEmail: row.userId ? userMap.get(row.userId) ?? null : null,
    }));
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
