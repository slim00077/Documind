import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class SummaryDto {
  @IsOptional()
  @IsIn(["short", "detailed", "sections"])
  level?: "short" | "detailed" | "sections";
}

export class QuestionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(20)
  count?: number;

  @IsOptional()
  @IsIn(["study", "review"])
  mode?: "study" | "review";
}

export class CompareManyDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  documentIds!: number[];
}

export class CollectionInsightsDto {
  /** Omit to analyse every document the user can access. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  documentIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** Skip the (LLM-written) interpretation and return computed statistics only. */
  @IsOptional()
  interpret?: boolean;
}
