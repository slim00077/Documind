import { IsEnum, IsOptional } from "class-validator";
import { AiResponseStyle, Language, Theme } from "../../../../generated/prisma/client";

export class UpdatePreferencesDto {
  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;

  @IsOptional()
  @IsEnum(AiResponseStyle)
  aiResponseStyle?: AiResponseStyle;

  /** Interface and AI answer language. */
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
