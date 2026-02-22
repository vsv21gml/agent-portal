import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GitlabController } from "./gitlab.controller";
import { GitlabService } from "./gitlab.service";
import { GitlabGroupEntity } from "./entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "./entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "./entities/gitlab-repo.entity";

@Module({
  imports: [TypeOrmModule.forFeature([GitlabGroupEntity, GitlabRepoEntity, GitlabMemberSyncEntity])],
  controllers: [GitlabController],
  providers: [GitlabService],
  exports: [GitlabService, TypeOrmModule],
})
export class GitlabModule {}
