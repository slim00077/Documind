import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateCategoryDto {
  @IsString()
  @MinLength(1, { message: "Name is required" })
  @MaxLength(100, { message: "Name is too long" })
  name!: string;
}
