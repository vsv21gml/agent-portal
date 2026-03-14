import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProjectsModule } from "../projects/projects.module";
import { VectorKeyEntity } from "./entities/vector-key.entity";
import { VectorDbController } from "./vectordb.controller";
import { VectorDbService } from "./vectordb.service";

@Module({
  imports: [ConfigModule, ProjectsModule, TypeOrmModule.forFeature([VectorKeyEntity])],
  controllers: [VectorDbController],
  providers: [VectorDbService],
  exports: [VectorDbService, TypeOrmModule],
})
export class VectorDbModule {}
