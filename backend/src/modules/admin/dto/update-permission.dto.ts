import { IsIn } from "class-validator";
import { DocumentRole } from "../../../../generated/prisma/client";

export class UpdatePermissionDto {
  @IsIn(Object.values(DocumentRole))
  role!: DocumentRole;
}
