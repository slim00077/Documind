import { IsIn, IsInt } from "class-validator";
import { DocumentRole } from "../../../../generated/prisma/client";

export class GrantPermissionDto {
  @IsInt()
  documentId!: number;

  @IsIn(Object.values(DocumentRole))
  role!: DocumentRole;
}
