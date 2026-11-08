import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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

  /** Comma-separated document ids, e.g. "3,7". Access is still enforced server-side. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" && value.trim()
      ? value.split(",").map((part: string) => Number(part.trim()))
      : undefined,
  )
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

  /** Exact MIME type, or a prefix ending in "/" (e.g. "image/"). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[\w.+-]+\/[\w.+-]*$/, { message: "Invalid MIME type filter" })
  mimeType?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;

  @IsOptional()
  @IsIn(["none", "lexical", "llm"])
  rerank?: "none" | "lexical" | "llm";
}
