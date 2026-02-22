import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("litellm_teams")
@Unique(["projectId"])
export class LiteLlmTeamEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  teamName!: string;
}
