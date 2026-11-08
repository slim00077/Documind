import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { InvitationsService } from "./invitations.service";
import { OrgEventsService } from "./org-events.service";
import { AdminOrganizationsController, InvitationLinksController, OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [AuthModule, AuditLogModule, NotificationsModule],
  controllers: [OrganizationsController, InvitationLinksController, AdminOrganizationsController, GroupsController],
  providers: [OrganizationsService, InvitationsService, GroupsService, OrgEventsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
