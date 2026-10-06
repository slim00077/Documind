import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction } from "../../../generated/prisma/client";

const categorySelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      documents: true,
    },
  },
} as const;

type CategoryRecord = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { documents: number };
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll() {
    const categories = await this.prisma.category.findMany({
      select: categorySelect,
      orderBy: { name: "asc" },
    });

    return categories.map((category) => this.toResponse(category));
  }

  async create(dto: CreateCategoryDto, actorId: number) {
    const category = await this.prisma.category.create({
      data: { name: dto.name.trim() },
      select: categorySelect,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CATEGORY_CREATE,
      targetType: "Category",
      targetId: category.id,
      metadata: { name: category.name },
    });

    return this.toResponse(category);
  }

  async update(id: number, dto: UpdateCategoryDto, actorId: number) {
    await this.assertExists(id);

    const category = await this.prisma.category.update({
      where: { id },
      data: { name: dto.name.trim() },
      select: categorySelect,
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CATEGORY_UPDATE,
      targetType: "Category",
      targetId: id,
      metadata: { name: category.name },
    });

    return this.toResponse(category);
  }

  async remove(id: number, actorId: number): Promise<{ id: number; message: string }> {
    const existing = await this.assertExists(id);

    await this.prisma.category.delete({ where: { id } });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CATEGORY_DELETE,
      targetType: "Category",
      targetId: id,
      metadata: { name: existing.name },
    });

    return { id, message: "Category deleted successfully" };
  }

  private async assertExists(id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }

  private toResponse(category: CategoryRecord) {
    const { _count, ...rest } = category;

    return {
      ...rest,
      documentCount: _count.documents,
    };
  }
}
