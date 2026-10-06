import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Event } from './event.entity';
import { CreateEventDto, QueryEventDto, UpdateEventDto } from './event.dto';
import { Category } from '../category/category.entity';
import { Invitation } from '../invitation/invitation.entity';
import { S3Service } from '../upload/s3.service';
import { InvitationService } from '../invitation/invitation.service';

export interface PaginatedEvents {
  data: Event[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
    private readonly s3Service: S3Service,
    private readonly invitationService: InvitationService,
  ) {}

  private async ensureCategoryExists(categoryId: number): Promise<void> {
    const exists = await this.categoryRepository.existsBy({ id: categoryId });
    if (!exists) {
      throw new BadRequestException(`Category with id ${categoryId} not found`);
    }
  }

  async create(
    dto: CreateEventDto,
    image: Express.Multer.File,
  ): Promise<Event> {
    if (!image) {
      throw new BadRequestException('Image is required');
    }

    await this.ensureCategoryExists(dto.categoryId);

    const imageUrl = await this.s3Service.uploadFile(image, 'events');

    const event = await this.eventRepository.save({
      name: dto.name,
      imageUrl,
      categoryId: dto.categoryId,
    });

    // Event mới là một cột mới (giá trị 0) trên chart invitation.
    this.invitationService.notifyStatsChanged('event', 'created', event.id);

    return this.findOne(event.id);
  }

  async findAll(query: QueryEventDto): Promise<PaginatedEvents> {
    const { categoryId, search, page, limit } = query;

    const [data, total] = await this.eventRepository.findAndCount({
      where: {
        ...(categoryId && { categoryId }),
        ...(search && { name: Like(`%${search}%`) }),
      },
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<Event> {
    const event = await this.eventRepository.findOneBy({ id });
    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }
    return event;
  }

  async update(
    id: number,
    dto: UpdateEventDto,
    image?: Express.Multer.File,
  ): Promise<Event> {
    const event = await this.findOne(id);

    // Cập nhật theo từng cột thay vì save() cả entity: entity load lên có sẵn
    // quan hệ `category` (eager), khi save nó sẽ ghi đè lại `categoryId`.
    const changes: Partial<Event> = {};

    if (dto.categoryId !== undefined) {
      await this.ensureCategoryExists(dto.categoryId);
      changes.categoryId = dto.categoryId;
    }

    if (dto.name !== undefined) {
      changes.name = dto.name;
    }

    if (image) {
      await this.s3Service.deleteFile(event.imageUrl);
      changes.imageUrl = await this.s3Service.uploadFile(image, 'events');
    }

    if (Object.keys(changes).length > 0) {
      await this.eventRepository.update(id, changes);
    }

    // Chart hiển thị tên và categoryId của event; chỉ đổi ảnh thì không cần bắn.
    if (changes.name !== undefined || changes.categoryId !== undefined) {
      this.invitationService.notifyStatsChanged('event', 'updated', id);
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const event = await this.findOne(id);

    const invitationsUsingEvent = await this.invitationRepository.countBy({
      eventId: id,
    });

    if (invitationsUsingEvent > 0) {
      throw new ConflictException(
        `Cannot delete event "${event.name}": it is used by ${invitationsUsingEvent} invitation(s)`,
      );
    }

    await this.s3Service.deleteFile(event.imageUrl);
    await this.eventRepository.delete(id);
    this.invitationService.notifyStatsChanged('event', 'deleted', id);
  }
}
