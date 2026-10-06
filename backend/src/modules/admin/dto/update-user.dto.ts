import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { Role } from "../../../../generated/prisma/client";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;
}
