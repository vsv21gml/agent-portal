import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("project_resource_limits")
@Unique(["projectId"])
export class ProjectResourceLimitEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column({ type: "int", default: 2 })
  cpu!: number;

  @Column({ type: "int", default: 8 })
  memoryGi!: number;
}
