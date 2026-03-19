export class CreateManagedNodeGroupDto {
  nodeGroupName!: string;
  instanceTypes?: string[];
  minSize?: number;
  maxSize?: number;
  desiredSize?: number;
  diskSize?: number;
  capacityType?: "ON_DEMAND" | "SPOT";
  amiType?: string;
}
