import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  GroupTeacherRole,
  MembershipStatus,
  OrgRole,
  OrganizationStatus,
  OrganizationType,
  RequestStatus,
} from "../../../generated/prisma/client";

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class MemberQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(OrgRole) role?: OrgRole;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
}

export class GroupQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(["ACTIVE", "ARCHIVED"]) status?: "ACTIVE" | "ARCHIVED";
}

export class RequestQueryDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
}

export class CreateOrganizationDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsEnum(OrganizationType) organizationType?: OrganizationType;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isDiscoverable?: boolean;
  /** Account (or invitee) that becomes the first organization administrator. */
  @IsOptional() @IsEmail() adminEmail?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(OrganizationType) organizationType?: OrganizationType;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isDiscoverable?: boolean;
}

export class SetOrganizationStatusDto {
  @IsEnum(OrganizationStatus) status!: OrganizationStatus;
}

export class AddMemberDto {
  @IsEmail() email!: string;
  @IsEnum(OrgRole) role!: OrgRole;
}

export class UpdateMemberDto {
  @IsOptional() @IsEnum(OrgRole) role?: OrgRole;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
}

export class CreateInvitationDto {
  @IsEmail() email!: string;
  @IsEnum(OrgRole) role!: OrgRole;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) groupId?: number;
}

export class JoinByCodeDto {
  @IsString() @Length(4, 32) code!: string;
}

export class OrgJoinRequestDto {
  /** Either the organization's join code or (for discoverable organizations) just its id. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) organizationId?: number;
  @IsOptional() @IsString() @Length(4, 32) code?: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class GroupJoinRequestDto {
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class GroupJoinByCodeDto extends GroupJoinRequestDto {
  @IsString() @Length(4, 32) code!: string;
}

export class CreateGroupDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(120) subject?: string;
  @IsOptional() @IsString() @MaxLength(40) academicYear?: string;
  /** Admins may name the lead teacher; a teacher creating a group is always its lead. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) leadTeacherId?: number;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(120) subject?: string;
  @IsOptional() @IsString() @MaxLength(40) academicYear?: string;
}

export class AssignTeacherDto {
  @Type(() => Number) @IsInt() @Min(1) teacherId!: number;
  @IsOptional() @IsEnum(GroupTeacherRole) role?: GroupTeacherRole;
}

export class AddStudentDto {
  @Type(() => Number) @IsInt() @Min(1) studentId!: number;
}

export class ShareDocumentDto {
  @Type(() => Number) @IsInt() @Min(1) documentId!: number;
}

export class AddOrgAdminDto {
  @IsEmail() email!: string;
}
