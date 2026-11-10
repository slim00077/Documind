import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { Language } from "../../../../generated/prisma/client";

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: "Name is required" })
  name!: string;

  @IsEmail({}, { message: "A valid email is required" })
  email!: string;

  @IsString()
  @MinLength(8, {
    message: "Password must be at least 8 characters long",
  })
  password!: string;

  /** Optional: the interface language the visitor signed up in. */
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
