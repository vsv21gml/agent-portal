import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("access_logs")
export class AccessLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @Column({ type: "varchar", nullable: true })
  clientIp!: string | null;

  @Column({ type: "varchar" })
  eventType!: string;

  @Column({ type: "varchar", nullable: true })
  authProvider!: string | null;

  @Column({ type: "varchar" })
  status!: string;

  @Column({ type: "varchar", nullable: true })
  userEmail!: string | null;

  @Column({ type: "text", nullable: true })
  detail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
