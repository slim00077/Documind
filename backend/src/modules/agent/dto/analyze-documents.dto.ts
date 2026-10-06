import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AnalyzeDocumentsDto {
  @IsString()
  @MinLength(1, { message: "Task is required" })
  @MaxLength(2000, { message: "Task is too long" })
  task!: string;

  /** Optional: restrict the analysis to these documents. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  documentIds?: number[];

  /** Optional: append the result to this existing conversation. */
  @IsOptional()
  @IsInt()
  conversationId?: number;
}
