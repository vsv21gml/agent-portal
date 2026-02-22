import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IssueVectorKeyDto } from "./dto/issue-vector-key.dto";
import { VectorKeyEntity } from "./entities/vector-key.entity";

@Injectable()
export class VectorDbService {
  constructor(
    @InjectRepository(VectorKeyEntity)
    private readonly vectorKeyRepository: Repository<VectorKeyEntity>,
  ) {}

  issueKey(projectId: string, ownerUserId: string, dto: IssueVectorKeyDto): Promise<VectorKeyEntity> {
    return this.vectorKeyRepository.save(
      this.vectorKeyRepository.create({
        projectId,
        ownerUserId,
        keyAlias: dto.keyAlias,
      }),
    );
  }

  listProjectKeys(projectId: string): Promise<VectorKeyEntity[]> {
    return this.vectorKeyRepository.find({ where: { projectId }, order: { createdAt: "DESC" } });
  }
}
