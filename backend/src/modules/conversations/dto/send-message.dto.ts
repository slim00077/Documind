import { IsString, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: "Message is required" })
  @MaxLength(2000, { message: "Message is too long" })
  content!: string;
}
