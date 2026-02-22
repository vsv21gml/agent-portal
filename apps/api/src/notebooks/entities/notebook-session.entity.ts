import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("notebook_sessions")
@Unique(["projectId", "userId"])
export class NotebookSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  userId!: string;

  @Column()
  endpointPath!: string;

  @Column({ default: "provisioning" })
  status!: string;

  @Column({ nullable: true })
  namespace!: string | null;

  @Column({ nullable: true })
  pvcSubPath!: string | null;

  @Column({ type: "int", default: 1 })
  cpuRequest!: number;

  @Column({ type: "int", default: 2 })
  memoryGiRequest!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
