import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("audit_logs")
export class AuditLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: true })
  userId!: string | null;

  @Column()
  method!: string;

  @Column()
  path!: string;

  @Column({ type: "text", nullable: true })
  requestBody!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
