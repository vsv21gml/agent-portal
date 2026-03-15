import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("access_logs")
export class AccessLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @Column({ type: "varchar", nullable: true })
  clientIp!: string | null;

  @Column()
  method!: string;

  @Column()
  path!: string;

  @Column()
  statusCode!: number;

  @Column()
  elapsedMs!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
