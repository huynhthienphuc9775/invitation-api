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
import { EventService, PaginatedEvents } from './event.service';
import { CreateEventDto, QueryEventDto, UpdateEventDto } from './event.dto';
import { Event } from './event.entity';
import { Auth } from '../auth/auth.decorator';

@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Auth('admin')
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ transform: true }))
  createEvent(
    @Body() dto: CreateEventDto,
    @UploadedFile() image: Express.Multer.File,
  ): Promise<Event> {
    return this.eventService.create(dto, image);
  }

  @Auth('admin')
  @Get()
  @UsePipes(new ValidationPipe({ transform: true }))
  getAllEvents(@Query() query: QueryEventDto): Promise<PaginatedEvents> {
    return this.eventService.findAll(query);
  }

  @Auth('admin')
  @Get(':id')
  getEvent(@Param('id') id: number): Promise<Event> {
    return this.eventService.findOne(id);
  }

  @Auth('admin')
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ transform: true }))
  updateEvent(
    @Param('id') id: number,
    @Body() dto: UpdateEventDto,
    @UploadedFile() image: Express.Multer.File,
  ): Promise<Event> {
    return this.eventService.update(id, dto, image);
  }

  @Auth('admin')
  @Delete(':id')
  deleteEvent(@Param('id') id: number): Promise<void> {
    return this.eventService.remove(id);
  }
}
