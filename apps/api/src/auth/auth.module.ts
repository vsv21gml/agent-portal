import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GitlabModule } from "../gitlab/gitlab.module";
<<<<<<< HEAD
import { GitlabMemberSyncEntity } from "../gitlab/entities/gitlab-member-sync.entity";
import { LlmModule } from "../llm/llm.module";
import { LiteLlmUserKeyEntity } from "../llm/entities/litellm-user-key.entity";
import { ProjectMemberEntity } from "../projects/entities/project-member.entity";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { VectorKeyEntity } from "../vectordb/entities/vector-key.entity";
=======
import { LlmModule } from "../llm/llm.module";
>>>>>>> c18f70b91e82ad114d5018758f44e388c6040327
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RolePermissionEntity } from "./entities/role-permission.entity";
import { UserEntity } from "./entities/user.entity";
import { UserInvitationEntity } from "./entities/user-invitation.entity";
import { PermissionsService } from "./permissions.service";
import { SsoController } from "./sso.controller";
import { SsoService } from "./sso.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
<<<<<<< HEAD
    TypeOrmModule.forFeature([
      UserEntity,
      UserInvitationEntity,
      RolePermissionEntity,
      ProjectMemberEntity,
      GitlabMemberSyncEntity,
      LiteLlmUserKeyEntity,
      VectorKeyEntity,
      WorkspaceSessionEntity,
    ]),
=======
    TypeOrmModule.forFeature([UserEntity, UserInvitationEntity, RolePermissionEntity]),
>>>>>>> c18f70b91e82ad114d5018758f44e388c6040327
    GitlabModule,
    LlmModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET", "dev-secret"),
        signOptions: {
          expiresIn: Number(configService.get<string>("JWT_EXPIRES_IN_SECONDS", "43200")),
        },
      }),
    }),
  ],
  controllers: [AuthController, SsoController],
  providers: [AuthService, PermissionsService, SsoService, JwtStrategy],
  exports: [AuthService, PermissionsService, TypeOrmModule],
})
export class AuthModule {}
