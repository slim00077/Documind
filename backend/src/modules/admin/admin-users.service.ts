import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditAction, DocumentRole, Role } from "../../../generated/prisma/client";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { GrantPermissionDto } from "./dto/grant-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  theme: true,
  aiResponseStyle: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { documents: true } },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: QueryUsersDto) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
    const search = query.search?.trim();

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive === "true" } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: users.map((user) => this.toResponse(user)),
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toResponse(user);
  }

  async update(
    actingAdminId: number,
    id: number,
    dto: UpdateUserDto,
  ) {
    const target = await this.assertExists(id);

    if (dto.role && dto.role !== target.role && id === actingAdminId) {
      throw new ForbiddenException("You cannot change your own role");
    }

    const data: { name?: string; email?: string; role?: Role } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException("Email is already registered");
      }

      data.email = normalizedEmail;
    }

    if (dto.role !== undefined) {
      data.role = dto.role;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });

    await this.auditLog.log({
      actorId: actingAdminId,
      action:
        dto.role !== undefined && dto.role !== target.role
          ? AuditAction.USER_ROLE_CHANGE
          : AuditAction.USER_UPDATE,
      targetType: "User",
      targetId: id,
      metadata: { changes: dto },
    });

    return this.toResponse(user);
  }

  async setActive(actingAdminId: number, id: number, isActive: boolean) {
    if (id === actingAdminId && !isActive) {
      throw new ForbiddenException("You cannot disable your own account");
    }

    await this.assertExists(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: userSelect,
    });

    await this.auditLog.log({
      actorId: actingAdminId,
      action: isActive ? AuditAction.USER_ENABLE : AuditAction.USER_DISABLE,
      targetType: "User",
      targetId: id,
    });

    return this.toResponse(user);
  }

  async remove(actingAdminId: number, id: number) {
    if (id === actingAdminId) {
      throw new ForbiddenException("You cannot delete your own account");
    }

    const target = await this.assertExists(id);

    if (target.role === Role.ADMIN) {
      const otherAdmins = await this.prisma.user.count({
        where: { role: Role.ADMIN, id: { not: id } },
      });

      if (otherAdmins === 0) {
        throw new BadRequestException("Cannot delete the last remaining admin");
      }
    }

    await this.prisma.user.delete({ where: { id } });

    await this.auditLog.log({
      actorId: actingAdminId,
      action: AuditAction.USER_DELETE,
      targetType: "User",
      targetId: id,
      metadata: { deletedEmail: target.email },
    });

    return { id, message: "User deleted successfully" };
  }

  async listPermissions(userId: number) {
    await this.assertExists(userId);

    return this.prisma.documentPermission.findMany({
      where: { userId },
      include: {
        document: { select: { id: true, name: true, status: true, userId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async grantPermission(
    actingAdminId: number,
    userId: number,
    dto: GrantPermissionDto,
  ) {
    if (dto.role === DocumentRole.OWNER) {
      throw new BadRequestException(
        "Ownership is tied to the document's uploader, not a grantable permission",
      );
    }

    await this.assertExists(userId);

    const document = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
      select: { id: true, userId: true, name: true },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    if (document.userId === userId) {
      throw new BadRequestException("This user already owns the document");
    }

    const previous = await this.prisma.documentPermission.findUnique({
      where: { documentId_userId: { documentId: dto.documentId, userId } },
      select: { role: true },
    });

    const permission = await this.prisma.documentPermission.upsert({
      where: { documentId_userId: { documentId: dto.documentId, userId } },
      create: { documentId: dto.documentId, userId, role: dto.role },
      update: { role: dto.role },
      include: {
        document: { select: { id: true, name: true, status: true, userId: true } },
      },
    });

    await this.auditLog.log({
      actorId: actingAdminId,
      action: AuditAction.PERMISSION_GRANT,
      targetType: "Document",
      targetId: dto.documentId,
      metadata: { userId, role: dto.role },
    });

    if (!previous) {
      await this.notifications.notify({
        userId,
        type: "DOCUMENT_SHARED",
        title: "Document shared with you",
        message: `"${document.name}" was shared with you as ${dto.role.toLowerCase()}.`,
        documentId: document.id,
      });
    } else if (previous.role !== dto.role) {
      await this.notifications.notify({
        userId,
        type: "PERMISSION_CHANGED",
        title: "Access level changed",
        message: `Your access to "${document.name}" is now ${dto.role.toLowerCase()}.`,
        documentId: document.id,
      });
    }

    return permission;
  }

  async updatePermission(
    actingAdminId: number,
    userId: number,
    permissionId: number,
    dto: UpdatePermissionDto,
  ) {
    if (dto.role === DocumentRole.OWNER) {
      throw new BadRequestException(
        "Ownership is tied to the document's uploader, not a grantable permission",
      );
    }

    const existing = await this.prisma.documentPermission.findFirst({
      where: { id: permissionId, userId },
    });

    if (!existing) {
      throw new NotFoundException("Permission not found");
    }

    const permission = await this.prisma.documentPermission.update({
      where: { id: permissionId },
      data: { role: dto.role },
      include: {
        document: { select: { id: true, name: true, status: true, userId: true } },
      },
    });

    await this.auditLog.log({
      actorId: actingAdminId,
      action: AuditAction.PERMISSION_UPDATE,
      targetType: "Document",
      targetId: existing.documentId,
      metadata: { userId, role: dto.role },
    });

    if (existing.role !== dto.role) {
      await this.notifications.notify({
        userId,
        type: "PERMISSION_CHANGED",
        title: "Access level changed",
        message: `Your access to "${permission.document.name}" is now ${dto.role.toLowerCase()}.`,
        documentId: existing.documentId,
      });
    }

    return permission;
  }

  async revokePermission(
    actingAdminId: number,
    userId: number,
    permissionId: number,
  ) {
    const existing = await this.prisma.documentPermission.findFirst({
      where: { id: permissionId, userId },
    });

    if (!existing) {
      throw new NotFoundException("Permission not found");
    }

    await this.prisma.documentPermission.delete({ where: { id: permissionId } });

    const revokedDocument = await this.prisma.document.findUnique({
      where: { id: existing.documentId },
      select: { name: true },
    });
    await this.notifications.notify({
      userId,
      type: "PERMISSION_REVOKED",
      title: "Access removed",
      message: `Your access to "${revokedDocument?.name ?? "a document"}" was removed.`,
      documentId: null,
    });

    await this.auditLog.log({
      actorId: actingAdminId,
      action: AuditAction.PERMISSION_REVOKE,
      targetType: "Document",
      targetId: existing.documentId,
      metadata: { userId },
    });

    return { id: permissionId, message: "Permission revoked" };
  }

  private async assertExists(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private toResponse(user: {
    id: number;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    theme: unknown;
    aiResponseStyle: unknown;
    createdAt: Date;
    updatedAt: Date;
    _count: { documents: number };
  }) {
    const { _count, ...rest } = user;
    return { ...rest, documentCount: _count.documents };
  }
}
