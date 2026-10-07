import { Module } from "@nestjs/common";
import { InvitationsService } from "./invitations.service";
import { OrgAccessGuard } from "./org-access.guard";
import { InvitationsController, OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  controllers: [OrganizationsController, InvitationsController],
  providers: [OrganizationsService, InvitationsService, OrgAccessGuard],
})
export class OrganizationsModule {}
