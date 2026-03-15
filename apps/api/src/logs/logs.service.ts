import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../auth/entities/user.entity";
import { AccessLogEntity } from "./entities/access-log.entity";
import { AuditLogEntity } from "./entities/audit-log.entity";

type AuditInput = {
  userId: string | null;
  actionKey: string;
  targetType?: string | null;
  targetId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type AccessInput = {
  userId: string | null;
  userEmail?: string | null;
  clientIp: string | null;
  eventType: string;
  authProvider?: string | null;
  status: "success" | "failure";
  detail?: string | null;
};

type AuditLogView = AuditLogEntity & {
  userEmail: string | null;
};

type AccessLogView = AccessLogEntity;

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
      await this.auditRepository.save(
        this.auditRepository.create({
          userId: input.userId,
          actionKey: input.actionKey,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          projectId: input.projectId ?? null,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to persist audit log for ${input.actionKey}: ${this.describeError(error)}`);
    }
  }

  async writeAccessLog(input: AccessInput): Promise<void> {
    try {
      await this.accessRepository.save(
        this.accessRepository.create({
          userId: input.userId,
          userEmail: input.userEmail ?? null,
          clientIp: input.clientIp,
          eventType: input.eventType,
          authProvider: input.authProvider ?? null,
          status: input.status,
          detail: input.detail ?? null,
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to persist access log for ${input.eventType}: ${this.describeError(error)}`);
    }
  }

  async listAuditLogs(): Promise<AuditLogView[]> {
    const rows = await this.auditRepository.find({ order: { createdAt: "DESC" }, take: 200 });
    const userIds = Array.from(new Set(rows.map((row) => row.userId).filter((value): value is string => Boolean(value))));
    const users = userIds.length ? await this.userRepository.findBy(userIds.map((id) => ({ id }))) : [];
    const userMap = new Map(users.map((user) => [user.id, user.email]));
    return rows.map((row) => ({
      ...row,
      userEmail: row.userId ? userMap.get(row.userId) ?? null : null,
    }));
  }

  listAccessLogs(): Promise<AccessLogView[]> {
    return this.accessRepository.find({ order: { createdAt: "DESC" }, take: 200 });
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
