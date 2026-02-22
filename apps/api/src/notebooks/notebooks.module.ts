import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProjectsModule } from "../projects/projects.module";
import { NotebookSessionEntity } from "./entities/notebook-session.entity";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";

@Module({
  imports: [TypeOrmModule.forFeature([NotebookSessionEntity]), ProjectsModule],
  controllers: [NotebooksController],
  providers: [NotebooksService],
  exports: [NotebooksService, TypeOrmModule],
})
export class NotebooksModule {}
