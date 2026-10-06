import { IsEnum, IsOptional } from "class-validator";
import { AiResponseStyle, Theme } from "../../../../generated/prisma/client";

export class UpdatePreferencesDto {
  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;

  @IsOptional()
  @IsEnum(AiResponseStyle)
  aiResponseStyle?: AiResponseStyle;
}
