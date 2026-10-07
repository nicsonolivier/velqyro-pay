import { Global, Module } from "@nestjs/common";
import { DevOutboxController } from "./dev-outbox.controller";
import { NotificationsService } from "./notifications.service";

@Global()
@Module({ controllers: [DevOutboxController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
