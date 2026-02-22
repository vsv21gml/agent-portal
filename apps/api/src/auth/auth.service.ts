import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { Repository } from "typeorm";
import { GlobalRole } from "../common/enums/global-role.enum";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { UserEntity } from "./entities/user.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const exists = await this.userRepository.findOne({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException("Email already exists");
    }

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      displayName: dto.displayName?.trim() || dto.email.split("@")[0],
      globalRole: GlobalRole.USER,
    });
    const saved = await this.userRepository.save(user);
    return { accessToken: await this.signToken(saved) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return { accessToken: await this.signToken(user) };
  }

  async findById(userId: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async listUsers(): Promise<UserEntity[]> {
    return this.userRepository.find({ order: { createdAt: "DESC" } });
  }

  async setGlobalRole(userId: string, globalRole: GlobalRole): Promise<UserEntity> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });
    user.globalRole = globalRole;
    return this.userRepository.save(user);
  }

  async issueTokenForUser(user: UserEntity): Promise<{ accessToken: string }> {
    return { accessToken: await this.signToken(user) };
  }

  async upsertSsoUser(email: string, displayName?: string): Promise<UserEntity> {
    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      user = await this.userRepository.save(
        this.userRepository.create({
          email,
          passwordHash: await bcrypt.hash(`sso-${Date.now()}`, 10),
          displayName: displayName?.trim() || email.split("@")[0],
          globalRole: GlobalRole.USER,
        }),
      );
    }
    return user;
  }

  private async signToken(user: UserEntity): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.globalRole,
    });
  }
}
