import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import { IsNull, Repository } from "typeorm";
import { GlobalRole } from "../common/enums/global-role.enum";
import { GitlabService } from "../gitlab/gitlab.service";
import { LogsService } from "../logs/logs.service";
import { GitlabMemberSyncEntity } from "../gitlab/entities/gitlab-member-sync.entity";
import { LlmService } from "../llm/llm.service";
import { LiteLlmUserKeyEntity } from "../llm/entities/litellm-user-key.entity";
import { ProjectMemberEntity } from "../projects/entities/project-member.entity";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { VectorKeyEntity } from "../vectordb/entities/vector-key.entity";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserEntity } from "./entities/user.entity";
import { UserInvitationEntity } from "./entities/user-invitation.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserInvitationEntity)
    private readonly invitationRepository: Repository<UserInvitationEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly projectMemberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(GitlabMemberSyncEntity)
    private readonly gitlabMemberSyncRepository: Repository<GitlabMemberSyncEntity>,
    @InjectRepository(LiteLlmUserKeyEntity)
    private readonly llmUserKeyRepository: Repository<LiteLlmUserKeyEntity>,
    @InjectRepository(VectorKeyEntity)
    private readonly vectorKeyRepository: Repository<VectorKeyEntity>,
    @InjectRepository(WorkspaceSessionEntity)
    private readonly workspaceRepository: Repository<WorkspaceSessionEntity>,
    private readonly jwtService: JwtService,
    private readonly gitlabService: GitlabService,
    private readonly llmService: LlmService,
    private readonly logsService: LogsService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName?.trim() || email.split("@")[0];
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const existing = await this.userRepository.findOne({ where: { email } });

    if (existing?.approvalStatus === "approved") {
      throw new ConflictException("Email already exists");
    }

    const user =
      existing ??
      this.userRepository.create({
        email,
        displayName,
        globalRole: GlobalRole.USER,
      });

    user.passwordHash = passwordHash;
    user.displayName = displayName;
    user.globalRole = GlobalRole.USER;
    user.approvalStatus = "pending";
    user.approvedAt = null;
    await this.userRepository.save(user);

    return { accessToken: "" };
  }

  async login(dto: LoginDto, clientIp: string | null): Promise<{ accessToken: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      await this.logsService.writeAccessLog({
        userId: null,
        userEmail: dto.email.trim().toLowerCase(),
        clientIp,
        eventType: "LOGIN",
        authProvider: "password",
        status: "failure",
        detail: "Invalid credentials",
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      await this.logsService.writeAccessLog({
        userId: user.id,
        userEmail: user.email,
        clientIp,
        eventType: "LOGIN",
        authProvider: "password",
        status: "failure",
        detail: "Invalid credentials",
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.approvalStatus === "pending") {
      await this.logsService.writeAccessLog({
        userId: user.id,
        userEmail: user.email,
        clientIp,
        eventType: "LOGIN",
        authProvider: "password",
        status: "failure",
        detail: "Account approval pending",
      });
      throw new ForbiddenException("Account approval pending");
    }

    if (user.approvalStatus === "rejected") {
      await this.logsService.writeAccessLog({
        userId: user.id,
        userEmail: user.email,
        clientIp,
        eventType: "LOGIN",
        authProvider: "password",
        status: "failure",
        detail: "Account approval rejected",
      });
      throw new ForbiddenException("Account approval rejected");
    }

    await this.logsService.writeAccessLog({
      userId: user.id,
      userEmail: user.email,
      clientIp,
      eventType: "LOGIN",
      authProvider: "password",
      status: "success",
      detail: null,
    });
    return { accessToken: await this.signToken(user) };
  }

  async logout(userId: string, clientIp: string | null): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    await this.logsService.writeAccessLog({
      userId,
      userEmail: user?.email ?? null,
      clientIp,
      eventType: "LOGOUT",
      authProvider: "jwt",
      status: "success",
      detail: null,
    });
  }

  async findById(userId: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async getProfile(userId: string): Promise<{ sub: string; email: string; role: GlobalRole; displayName: string }> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });
    return {
      sub: user.id,
      email: user.email,
      role: user.globalRole,
      displayName: user.displayName,
    };
  }

  async listUsers(): Promise<UserEntity[]> {
    return this.userRepository.find({ order: { createdAt: "DESC" } });
  }

  async setGlobalRole(userId: string, globalRole: GlobalRole): Promise<UserEntity> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });
    user.globalRole = globalRole;
    return this.userRepository.save(user);
  }

  async approveUser(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });
    user.approvalStatus = "approved";
    user.approvedAt = new Date();
    const saved = await this.userRepository.save(user);
    await this.gitlabService.ensureUser(saved.email, saved.displayName);
    await this.llmService.ensureUserVirtualKey(saved.id, saved.email, saved.displayName);
    return saved;
  }

  async rejectUser(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });
    user.approvalStatus = "rejected";
    user.approvedAt = null;
    return this.userRepository.save(user);
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });
    user.displayName = dto.displayName.trim();
    return this.userRepository.save(user);
  }

  async deleteUser(userId: string, actorUserId: string): Promise<void> {
    if (userId === actorUserId) {
      throw new ConflictException("You cannot delete your own account");
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.projectMemberRepository.delete({ userId });
    await this.gitlabMemberSyncRepository.delete({ userId });
    await this.llmUserKeyRepository.delete({ ownerUserId: userId });
    await this.vectorKeyRepository.delete({ ownerUserId: userId });
    await this.workspaceRepository.delete({ userId });
    await this.invitationRepository.delete({ email: user.email, acceptedAt: IsNull() });
    await this.userRepository.delete({ id: userId });
  }

  async listInvitations(): Promise<UserInvitationEntity[]> {
    throw new ForbiddenException("Invitation flow has been removed");
  }

  async createInvitation(dto: CreateInvitationDto, invitedByUserId: string): Promise<UserInvitationEntity> {
    void dto;
    void invitedByUserId;
    throw new ForbiddenException("Invitation flow has been removed");
  }

  async deleteInvitation(invitationId: string): Promise<void> {
    void invitationId;
    throw new ForbiddenException("Invitation flow has been removed");
  }

  async getInvitationByToken(token: string): Promise<UserInvitationEntity> {
    void token;
    throw new ForbiddenException("Invitation flow has been removed");
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto): Promise<{ accessToken: string; role: GlobalRole }> {
    void token;
    void dto;
    throw new ForbiddenException("Invitation flow has been removed");
  }

  async issueTokenForUser(user: UserEntity): Promise<{ accessToken: string }> {
    return { accessToken: await this.signToken(user) };
  }

  async upsertSsoUser(email: string, displayName?: string): Promise<UserEntity> {
    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      const tempPassword = `sso-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      user = await this.userRepository.save(
        this.userRepository.create({
          email,
          passwordHash: await bcrypt.hash(tempPassword, 10),
          displayName: displayName?.trim() || email.split("@")[0],
          globalRole: GlobalRole.USER,
          approvalStatus: "approved",
          approvedAt: new Date(),
        }),
      );
      await this.gitlabService.ensureUser(user.email, user.displayName, tempPassword);
      await this.llmService.ensureUserVirtualKey(user.id, user.email, user.displayName);
      return user;
    }

    await this.gitlabService.ensureUser(user.email, user.displayName);
    await this.llmService.ensureUserVirtualKey(user.id, user.email, user.displayName);
    return user;
  }

  async ensureInitialAdmin(email: string | undefined, password: string | undefined): Promise<{ created: boolean; password?: string }> {
    if (!email) {
      return { created: false };
    }

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      if (existing.globalRole !== GlobalRole.ADMIN) {
        existing.globalRole = GlobalRole.ADMIN;
      }
      existing.approvalStatus = "approved";
      existing.approvedAt = existing.approvedAt ?? new Date();
      await this.userRepository.save(existing);
      await this.gitlabService.ensureUser(existing.email, existing.displayName, password);
      await this.llmService.ensureUserVirtualKey(existing.id, existing.email, existing.displayName);
      return { created: false };
    }

    const finalPassword = password ?? this.generateTempPassword();
    const user = this.userRepository.create({
      email,
      passwordHash: await bcrypt.hash(finalPassword, 10),
      displayName: email.split("@")[0],
      globalRole: GlobalRole.ADMIN,
      approvalStatus: "approved",
      approvedAt: new Date(),
    });
    await this.userRepository.save(user);
    await this.gitlabService.ensureUser(user.email, user.displayName, finalPassword);
    await this.llmService.ensureUserVirtualKey(user.id, user.email, user.displayName);
    return { created: true, password: password ? undefined : finalPassword };
  }

  private async signToken(user: UserEntity): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.globalRole,
    });
  }

  private generateTempPassword(): string {
    return `Admin-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
