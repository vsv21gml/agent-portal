import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("project_endpoints")
export class ProjectEndpointEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  endpointKey!: string;

  @Column()
  endpointUrl!: string;

  @Column()
  ingressName!: string;

  @Column({ type: "varchar", nullable: true })
  namespace!: string | null;

  @Column({ default: "unassigned" })
  status!: "unassigned" | "connected";

  @Column({ type: "varchar", nullable: true })
  targetType!: "agent" | "mcp" | null;

  @Column({ type: "uuid", nullable: true })
  targetId!: string | null;

  @Column({ type: "varchar", nullable: true })
  targetName!: string | null;

  @Column({ type: "varchar", nullable: true })
  targetServiceName!: string | null;

  @Column({ type: "varchar", nullable: true })
  targetNamespace!: string | null;

  @Column({ type: "text", nullable: true })
  targetEndpointUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
