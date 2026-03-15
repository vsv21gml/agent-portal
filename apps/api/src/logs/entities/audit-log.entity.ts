import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("audit_logs")
export class AuditLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @Column({ type: "varchar" })
  actionKey!: string;

  @Column({ type: "varchar", nullable: true })
  targetType!: string | null;

  @Column({ type: "varchar", nullable: true })
  targetId!: string | null;

  @Column({ type: "varchar", nullable: true })
  projectId!: string | null;

  @Column({ type: "text", nullable: true })
  metadataJson!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
