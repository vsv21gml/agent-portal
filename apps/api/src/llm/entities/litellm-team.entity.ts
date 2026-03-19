import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("litellm_teams")
@Unique(["projectId"])
@Unique(["teamName"])
export class LiteLlmTeamEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  projectId!: string | null;

  @Column()
  teamName!: string;
}
