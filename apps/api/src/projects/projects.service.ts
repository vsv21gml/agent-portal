import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProjectRole } from "../common/enums/project-role.enum";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateResourceLimitDto } from "./dto/update-resource-limit.dto";
import { ProjectMemberEntity } from "./entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./entities/project-resource-limit.entity";
import { ProjectEntity } from "./entities/project.entity";

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly projectMemberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(ProjectResourceLimitEntity)
    private readonly resourceLimitRepository: Repository<ProjectResourceLimitEntity>,
  ) {}

  async createProject(dto: CreateProjectDto, creatorUserId: string): Promise<ProjectEntity> {
    const project = await this.projectRepository.save(this.projectRepository.create(dto));

    await this.projectMemberRepository.save(
      this.projectMemberRepository.create({
        projectId: project.id,
        userId: creatorUserId,
        role: ProjectRole.MANAGER,
      }),
    );

    await this.resourceLimitRepository.save(
      this.resourceLimitRepository.create({
        projectId: project.id,
        cpu: 2,
        memoryGi: 8,
      }),
    );

    return project;
  }

  listProjects(): Promise<ProjectEntity[]> {
    return this.projectRepository.find({ order: { createdAt: "DESC" } });
  }

  getProject(projectId: string): Promise<ProjectEntity> {
    return this.projectRepository.findOneByOrFail({ id: projectId });
  }

  listMembers(projectId: string): Promise<ProjectMemberEntity[]> {
    return this.projectMemberRepository.find({ where: { projectId } });
  }

  async addMember(projectId: string, dto: AddProjectMemberDto): Promise<ProjectMemberEntity> {
    const existing = await this.projectMemberRepository.findOne({
      where: { projectId, userId: dto.userId },
    });

    if (existing) {
      existing.role = dto.role;
      return this.projectMemberRepository.save(existing);
    }

    return this.projectMemberRepository.save(
      this.projectMemberRepository.create({
        projectId,
        userId: dto.userId,
        role: dto.role,
      }),
    );
  }

  async getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const member = await this.projectMemberRepository.findOne({ where: { projectId, userId } });
    return member?.role ?? null;
  }

  async getResourceLimit(projectId: string): Promise<ProjectResourceLimitEntity> {
    return this.resourceLimitRepository.findOneByOrFail({ projectId });
  }

  async updateResourceLimit(projectId: string, dto: UpdateResourceLimitDto): Promise<ProjectResourceLimitEntity> {
    const existing = await this.resourceLimitRepository.findOne({ where: { projectId } });
    if (!existing) {
      return this.resourceLimitRepository.save(this.resourceLimitRepository.create({ projectId, ...dto }));
    }

    existing.cpu = dto.cpu;
    existing.memoryGi = dto.memoryGi;
    return this.resourceLimitRepository.save(existing);
  }
}
