import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { AuditAction } from "../../../../generated/prisma/client";

export class QueryAuditLogsDto {
  @IsOptional()
  @IsIn(Object.values(AuditAction))
  action?: AuditAction;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actorId?: number;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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
