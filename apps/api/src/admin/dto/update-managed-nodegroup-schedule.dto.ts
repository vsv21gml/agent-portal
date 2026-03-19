export class UpdateManagedNodeGroupScheduleDto {
  enabled!: boolean;
  timezone?: string;
  scaleUpTime?: string | null;
  scaleDownTime?: string | null;
  nodeGroupName?: string | null;
  instanceTypes?: string[];
  minSize?: number | null;
  maxSize?: number | null;
  desiredSize?: number | null;
  diskSize?: number | null;
  capacityType?: "ON_DEMAND" | "SPOT" | null;
  amiType?: string | null;
}
