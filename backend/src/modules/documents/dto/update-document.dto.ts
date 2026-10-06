import { IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Name cannot be empty" })
  @MaxLength(200, { message: "Name is too long" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "Description is too long" })
  description?: string;

  @IsOptional()
  @IsInt()
  categoryId?: number;
}
