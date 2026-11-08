import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { AuthTokenPayload } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { DocumentIntelligenceService } from "./document-intelligence.service";
import { CollectionInsightsService } from "./collection-insights.service";
import { CollectionInsightsDto, CompareManyDto, QuestionsDto, SummaryDto } from "./intelligence.dto";

// User identity always comes from the verified JWT; per-document access is
// enforced inside the services (owner or explicit permission, never by id alone).
@Controller("intelligence")
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(
    private readonly intelligence: DocumentIntelligenceService,
    private readonly collection: CollectionInsightsService,
  ) {}

  @Post("documents/:id/summary")
  summary(@CurrentUser() user: AuthTokenPayload, @Param("id", ParseIntPipe) id: number, @Body() dto: SummaryDto) {
    return this.intelligence.summarize(user.userId, id, dto.level ?? "short");
  }

  @Post("documents/:id/extraction")
  extraction(@CurrentUser() user: AuthTokenPayload, @Param("id", ParseIntPipe) id: number) {
    return this.intelligence.extract(user.userId, id);
  }

  @Post("documents/:id/questions")
  questions(@CurrentUser() user: AuthTokenPayload, @Param("id", ParseIntPipe) id: number, @Body() dto: QuestionsDto) {
    return this.intelligence.generateQuestions(user.userId, id, dto.count ?? 8, dto.mode ?? "study");
  }

  @Post("compare")
  compare(@CurrentUser() user: AuthTokenPayload, @Body() dto: CompareManyDto) {
    return this.intelligence.compare(user.userId, dto.documentIds);
  }

  @Post("collection")
  collectionInsights(@CurrentUser() user: AuthTokenPayload, @Body() dto: CollectionInsightsDto) {
    return this.collection.analyze(user.userId, dto);
  }
}
