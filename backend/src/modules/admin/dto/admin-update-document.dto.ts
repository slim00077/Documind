import { IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class AdminUpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Name cannot be empty" })
  @MaxLength(200, { message: "Name is too long" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "Description is too long" })
  description?: string;

  // null clears the category.
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  categoryId?: number | null;
}
