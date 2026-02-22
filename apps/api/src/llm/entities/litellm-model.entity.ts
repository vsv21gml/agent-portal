import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("litellm_models")
export class LiteLlmModelEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  teamId!: string;

  @Column()
  modelName!: string;
}
