import { IsIn, IsOptional, IsString } from "class-validator";

export class QueryAdminDocumentsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["active", "trashed", "all"])
  state?: "active" | "trashed" | "all";

  @IsOptional()
  @IsIn(["PENDING", "UPLOADED", "PROCESSING", "READY", "COMPLETED", "FAILED"])
  status?: string;
}
