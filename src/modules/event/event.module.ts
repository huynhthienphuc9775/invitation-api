import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { Event } from './event.entity';
import { Category } from '../category/category.entity';
import { Invitation } from '../invitation/invitation.entity';
import { UploadModule } from '../upload/upload.module';
import { InvitationModule } from '../invitation/invitation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, Category, Invitation]),
    UploadModule,
    InvitationModule,
  ],
  controllers: [EventController],
  providers: [EventService],
})
export class EventModule {}
