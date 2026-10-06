import { IsInt, IsOptional } from "class-validator";

export class CreateConversationDto {
  @IsOptional()
  @IsInt()
  documentId?: number;
}
