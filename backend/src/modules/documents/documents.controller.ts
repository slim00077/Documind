import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService } from "./documents.service";
import { DocumentSearchService } from "./document-search.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { CompareDocumentsDto } from "./dto/compare-documents.dto";
import { DocumentComparisonService } from "./document-comparison.service";
import { SearchDocumentsDto } from "./dto/search-documents.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthTokenPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { documentFileInterceptorOptions } from "./documents-upload.config";
import { extractIp } from "../audit-log/audit-log.service";

@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly searchService: DocumentSearchService,
    private readonly comparisonService: DocumentComparisonService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", documentFileInterceptorOptions))
  create(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateDocumentDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.create(user.userId, dto, file, extractIp(req));
  }

  @Get()
  findAll(@CurrentUser() user: AuthTokenPayload) {
    return this.documentsService.findAll(user.userId);
  }

  @Get("shared")
  findShared(@CurrentUser() user: AuthTokenPayload) {
    return this.documentsService.findShared(user.userId);
  }

  @Post("compare")
  compare(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CompareDocumentsDto,
  ) {
    return this.comparisonService.compare(
      user.userId,
      dto.documentIdA,
      dto.documentIdB,
    );
  }

  @Post(":id/favorite")
  addFavorite(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.setFavorite(user.userId, id, true);
  }

  @Delete(":id/favorite")
  removeFavorite(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.setFavorite(user.userId, id, false);
  }

  @Get("search")
  search(
    @CurrentUser() user: AuthTokenPayload,
    @Query() dto: SearchDocumentsDto,
  ) {
    return this.searchService.search(user.userId, dto.query, dto.limit);
  }

  @Get("trash")
  listTrash(@CurrentUser() user: AuthTokenPayload) {
    return this.documentsService.listTrash(user.userId);
  }

  @Get(":id/versions")
  listVersions(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.listVersions(user.userId, id);
  }

  @Post(":id/versions")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", documentFileInterceptorOptions))
  uploadVersion(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.uploadVersion(
      user.userId,
      id,
      file,
      extractIp(req),
    );
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Param("versionId", ParseIntPipe) versionId: number,
    @Req() req: Request,
  ) {
    return this.documentsService.restoreVersion(
      user.userId,
      id,
      versionId,
      extractIp(req),
    );
  }

  @Get(":id/versions/:versionId/file")
  async downloadVersion(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Param("versionId", ParseIntPipe) versionId: number,
    @Res() res: Response,
  ) {
    const { absolutePath, downloadName } =
      await this.documentsService.getVersionFile(user.userId, id, versionId);
    res.download(absolutePath, downloadName);
  }

  @Post(":id/insights")
  generateInsights(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.generateInsights(user.userId, id);
  }

  @Post(":id/restore")
  restore(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.documentsService.restore(user.userId, id, extractIp(req));
  }

  @Delete(":id/permanent")
  removePermanently(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.documentsService.removePermanently(
      user.userId,
      id,
      extractIp(req),
    );
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.findOne(user.userId, id);
  }

  @Get(":id/image")
  async getImage(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { absolutePath, mimeType } = await this.documentsService.getImageFile(
      user.userId,
      id,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.sendFile(absolutePath);
  }

  @Get(":id/text")
  getExtractedText(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.getExtractedText(user.userId, id);
  }

  @Get(":id/chunks")
  getChunks(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.documentsService.getChunks(user.userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @Req() req: Request,
  ) {
    return this.documentsService.update(user.userId, id, dto, extractIp(req));
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthTokenPayload,
    @Param("id", ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.documentsService.remove(user.userId, id, extractIp(req));
  }
}
