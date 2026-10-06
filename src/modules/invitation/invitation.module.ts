import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { Invitation } from './invitation.entity';
import { Event } from '../event/event.entity';
import { UploadModule } from '../upload/upload.module';
import { AuthModule } from '../auth/auth.module';
import { InvitationGateway } from './invitation.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invitation, Event]),
    UploadModule,
    AuthModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService, InvitationGateway],
  // EventModule dùng để bắn lại thống kê chart khi event thay đổi.
  exports: [InvitationService],
})
export class InvitationModule {}
