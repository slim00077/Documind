"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
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
};
let CategoriesService = class CategoriesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        const categories = await this.prisma.category.findMany({
            select: categorySelect,
            orderBy: { name: "asc" },
        });
        return categories.map((category) => this.toResponse(category));
    }
    async create(dto) {
        const category = await this.prisma.category.create({
            data: { name: dto.name.trim() },
            select: categorySelect,
        });
        return this.toResponse(category);
    }
    async update(id, dto) {
        await this.assertExists(id);
        const category = await this.prisma.category.update({
            where: { id },
            data: { name: dto.name.trim() },
            select: categorySelect,
        });
        return this.toResponse(category);
    }
    async remove(id) {
        await this.assertExists(id);
        await this.prisma.category.delete({ where: { id } });
        return { id, message: "Category deleted successfully" };
    }
    async assertExists(id) {
        const category = await this.prisma.category.findUnique({ where: { id } });
        if (!category) {
            throw new common_1.NotFoundException("Category not found");
        }
    }
    toResponse(category) {
        const { _count, ...rest } = category;
        return {
            ...rest,
            documentCount: _count.documents,
        };
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CategoriesService);
