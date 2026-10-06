import { Type } from "class-transformer";
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { Role } from "../../../../generated/prisma/client";

export class QueryUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
