import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VectorKeyEntity } from "./entities/vector-key.entity";
import { VectorDbController } from "./vectordb.controller";
import { VectorDbService } from "./vectordb.service";

@Module({
  imports: [TypeOrmModule.forFeature([VectorKeyEntity])],
  controllers: [VectorDbController],
  providers: [VectorDbService],
  exports: [VectorDbService, TypeOrmModule],
})
export class VectorDbModule {}
