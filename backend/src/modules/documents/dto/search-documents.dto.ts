import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class SearchDocumentsDto {
  @IsString()
  @MinLength(1, { message: "Search query is required" })
  @MaxLength(2000, { message: "Search query is too long" })
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
