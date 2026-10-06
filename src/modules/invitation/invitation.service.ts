import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation } from './invitation.entity';
import {
  CreateInvitationDto,
  InvitationStatsQueryDto,
  QueryInvitationDto,
  UpdateInvitationDto,
} from './invitation.dto';
import { Event } from '../event/event.entity';
import { S3Service } from '../upload/s3.service';

export interface PaginatedInvitations {
  data: Invitation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvitationCountByEvent {
  eventId: number;
  eventName: string;
  total: number;
  active: number;
  inactive: number;
}

export interface InvitationStatsByEvent {
  data: InvitationCountByEvent[];
  total: number;
}

@Injectable()
export class InvitationService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly s3Service: S3Service,
  ) {}

  private async ensureEventExists(eventId: number): Promise<void> {
    const exists = await this.eventRepository.existsBy({ id: eventId });
    if (!exists) {
      throw new BadRequestException(`Event with id ${eventId} not found`);
    }
  }

  async create(
    dto: CreateInvitationDto,
    image: Express.Multer.File,
  ): Promise<Invitation> {
    if (!image) {
      throw new BadRequestException('Image is required');
    }

    await this.ensureEventExists(dto.eventId);

    const imageUrl = await this.s3Service.uploadFile(image, 'invitations');

    const invitation = await this.invitationRepository.save({
      name: dto.name,
      eventId: dto.eventId,
      imageUrl,
      active: dto.active ?? true,
    });

    return this.findOne(invitation.id);
  }

  async findAll(query: QueryInvitationDto): Promise<PaginatedInvitations> {
    const { eventId, categoryId, active, page, limit } = query;

    const [data, total] = await this.invitationRepository.findAndCount({
      where: {
        ...(eventId && { eventId }),
        // Category không lưu trên invitation mà suy ra qua event.
        ...(categoryId && { event: { categoryId } }),
        ...(active !== undefined && { active }),
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

  async countByEvent(
    query: InvitationStatsQueryDto,
  ): Promise<InvitationStatsByEvent> {
    // Đi từ bảng events + LEFT JOIN để event chưa có invitation nào vẫn hiện cột 0.
    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoin(Invitation, 'invitation', 'invitation.eventId = event.id')
      .select('event.id', 'eventId')
      .addSelect('event.name', 'eventName')
      .addSelect('COUNT(invitation.id)', 'total')
      .addSelect(
        'SUM(CASE WHEN invitation.active = 1 THEN 1 ELSE 0 END)',
        'active',
      )
      .groupBy('event.id')
      .addGroupBy('event.name')
      .orderBy('total', 'DESC')
      .addOrderBy('event.id', 'ASC');

    if (query.categoryId) {
      qb.where('event.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    const rows = await qb.getRawMany<{
      eventId: number | string;
      eventName: string;
      total: number | string;
      active: number | string | null;
    }>();

    // mysql2 trả COUNT/SUM dạng string (BIGINT/DECIMAL) nên phải ép về number.
    const data = rows.map((row) => {
      const total = Number(row.total);
      const active = Number(row.active ?? 0);
      return {
        eventId: Number(row.eventId),
        eventName: row.eventName,
        total,
        active,
        inactive: total - active,
      };
    });

    return {
      data,
      total: data.reduce((sum, item) => sum + item.total, 0),
    };
  }

  async findOne(id: number): Promise<Invitation> {
    const invitation = await this.invitationRepository.findOneBy({ id });
    if (!invitation) {
      throw new NotFoundException(`Invitation with id ${id} not found`);
    }
    return invitation;
  }

  async update(
    id: number,
    dto: UpdateInvitationDto,
    image?: Express.Multer.File,
  ): Promise<Invitation> {
    const invitation = await this.findOne(id);

    // Cập nhật theo từng cột thay vì save() cả entity: entity load lên có sẵn
    // quan hệ `event` (eager), khi save nó sẽ ghi đè lại `eventId`.
    const changes: Partial<Invitation> = {};

    if (dto.name !== undefined) {
      changes.name = dto.name;
    }

    if (dto.eventId !== undefined) {
      await this.ensureEventExists(dto.eventId);
      changes.eventId = dto.eventId;
    }

    if (dto.active !== undefined) {
      changes.active = dto.active;
    }

    if (image) {
      await this.s3Service.deleteFile(invitation.imageUrl);
      changes.imageUrl = await this.s3Service.uploadFile(image, 'invitations');
    }

    if (Object.keys(changes).length > 0) {
      await this.invitationRepository.update(id, changes);
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const invitation = await this.findOne(id);
    await this.s3Service.deleteFile(invitation.imageUrl);
    await this.invitationRepository.delete(id);
  }
}
