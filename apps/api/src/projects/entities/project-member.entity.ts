import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";
import { ProjectRole } from "../../common/enums/project-role.enum";

@Entity("project_members")
@Unique(["projectId", "userId"])
export class ProjectMemberEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  userId!: string;

  @Column({ type: "varchar", default: ProjectRole.MEMBER })
  role!: ProjectRole;
}
