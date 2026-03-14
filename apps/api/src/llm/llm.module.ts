import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LlmController } from "./llm.controller";
import { LlmService } from "./llm.service";
import { LiteLlmKeyEntity } from "./entities/litellm-key.entity";
import { LiteLlmModelEntity } from "./entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "./entities/litellm-team.entity";
import { LiteLlmUserKeyEntity } from "./entities/litellm-user-key.entity";

@Module({
  imports: [TypeOrmModule.forFeature([LiteLlmTeamEntity, LiteLlmKeyEntity, LiteLlmModelEntity, LiteLlmUserKeyEntity])],
  controllers: [LlmController],
  providers: [LlmService],
  exports: [LlmService, TypeOrmModule],
})
export class LlmModule {}
