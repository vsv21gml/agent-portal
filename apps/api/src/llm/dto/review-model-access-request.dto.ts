import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewModelAccessRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
