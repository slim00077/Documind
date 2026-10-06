import { IsString, MaxLength, MinLength } from "class-validator";

export class AskQuestionDto {
  @IsString()
  @MinLength(1, { message: "Question is required" })
  @MaxLength(2000, { message: "Question is too long" })
  question!: string;
}
