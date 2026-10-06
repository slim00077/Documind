import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  @MinLength(1, { message: "Name is required" })
  @MaxLength(200, { message: "Name is too long" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "Description is too long" })
  description?: string;

  // Arrives as a string over multipart/form-data, so it needs an explicit
  // transform to a number before @IsInt() can validate it.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}
