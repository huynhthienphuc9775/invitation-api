import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  InvitationService,
  InvitationStatsByEvent,
  PaginatedInvitations,
} from './invitation.service';
import {
  CreateInvitationDto,
  InvitationStatsQueryDto,
  QueryInvitationDto,
  UpdateInvitationDto,
} from './invitation.dto';
import { Invitation } from './invitation.entity';
import { Auth } from '../auth/auth.decorator';

@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Auth('admin')
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ transform: true }))
  createInvitation(
    @Body() dto: CreateInvitationDto,
    @UploadedFile() image: Express.Multer.File,
  ): Promise<Invitation> {
    return this.invitationService.create(dto, image);
  }

  @Auth('admin')
  @Get()
  @UsePipes(new ValidationPipe({ transform: true }))
  getAllInvitations(
    @Query() query: QueryInvitationDto,
  ): Promise<PaginatedInvitations> {
    return this.invitationService.findAll(query);
  }

  // Dữ liệu cho biểu đồ cột: số invitation theo từng event.
  // Khai báo trước `:id` để không bị route động nuốt mất.
  @Auth('admin')
  @Get('stats/by-event')
  @UsePipes(new ValidationPipe({ transform: true }))
  getStatsByEvent(
    @Query() query: InvitationStatsQueryDto,
  ): Promise<InvitationStatsByEvent> {
    return this.invitationService.countByEvent(query);
  }

  @Auth('admin')
  @Get(':id')
  getInvitation(@Param('id') id: number): Promise<Invitation> {
    return this.invitationService.findOne(id);
  }

  @Auth('admin')
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ transform: true }))
  updateInvitation(
    @Param('id') id: number,
    @Body() dto: UpdateInvitationDto,
    @UploadedFile() image: Express.Multer.File,
  ): Promise<Invitation> {
    return this.invitationService.update(id, dto, image);
  }

  @Auth('admin')
  @Delete(':id')
  deleteInvitation(@Param('id') id: number): Promise<void> {
    return this.invitationService.remove(id);
  }
}
