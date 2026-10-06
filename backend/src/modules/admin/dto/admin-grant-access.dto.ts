import { IsIn, IsInt } from "class-validator";
import { DocumentRole } from "../../../../generated/prisma/client";

export class AdminGrantAccessDto {
  @IsInt()
  userId!: number;

  @IsIn(Object.values(DocumentRole))
  role!: DocumentRole;
}
