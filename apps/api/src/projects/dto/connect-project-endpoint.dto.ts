import { IsIn, IsNotEmpty, IsString } from "class-validator";

export class ConnectProjectEndpointDto {
  @IsString()
  @IsIn(["agent", "mcp"])
  targetType!: "agent" | "mcp";

  @IsString()
  @IsNotEmpty()
  targetId!: string;
}
