import { IsInt, Min } from "class-validator";

export class CompareDocumentsDto {
  @IsInt()
  @Min(1)
  documentIdA!: number;

  @IsInt()
  @Min(1)
  documentIdB!: number;
}
