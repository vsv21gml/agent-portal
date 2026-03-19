import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

@Entity("managed_nodegroup_schedules")
@Unique(["poolType"])
export class ManagedNodeGroupScheduleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  poolType!: "workspace" | "serving";

  @Column({ default: false })
  enabled!: boolean;

  @Column({ default: "Asia/Seoul" })
  timezone!: string;

  @Column({ type: "varchar", nullable: true })
  scaleUpTime!: string | null;

  @Column({ type: "varchar", nullable: true })
  scaleDownTime!: string | null;

  @Column({ type: "varchar", nullable: true })
  nodeGroupName!: string | null;

  @Column({ type: "simple-json", nullable: true })
  instanceTypes!: string[] | null;

  @Column({ type: "int", nullable: true })
  minSize!: number | null;

  @Column({ type: "int", nullable: true })
  maxSize!: number | null;

  @Column({ type: "int", nullable: true })
  desiredSize!: number | null;

  @Column({ type: "int", nullable: true })
  diskSize!: number | null;

  @Column({ type: "varchar", nullable: true })
  capacityType!: "ON_DEMAND" | "SPOT" | null;

  @Column({ type: "varchar", nullable: true })
  amiType!: string | null;

  @Column({ type: "varchar", nullable: true })
  lastScaleUpDate!: string | null;

  @Column({ type: "varchar", nullable: true })
  lastScaleDownDate!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  lastActionAt!: Date | null;

  @Column({ type: "varchar", nullable: true })
  lastActionStatus!: string | null;

  @Column({ type: "text", nullable: true })
  lastActionMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
