import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LlmController } from "./llm.controller";
import { LlmService } from "./llm.service";
import { LiteLlmCatalogModelEntity } from "./entities/litellm-catalog-model.entity";
import { LiteLlmKeyEntity } from "./entities/litellm-key.entity";
import { LiteLlmModelAccessRequestEntity } from "./entities/litellm-model-access-request.entity";
import { LiteLlmModelEntity } from "./entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "./entities/litellm-team.entity";
import { LiteLlmUserKeyEntity } from "./entities/litellm-user-key.entity";
import { UserEntity } from "../auth/entities/user.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LiteLlmTeamEntity,
      LiteLlmKeyEntity,
      LiteLlmModelEntity,
      LiteLlmUserKeyEntity,
      LiteLlmCatalogModelEntity,
      LiteLlmModelAccessRequestEntity,
      UserEntity,
    ]),
  ],
  controllers: [LlmController],
  providers: [LlmService],
  exports: [LlmService, TypeOrmModule],
})
export class LlmModule {}
