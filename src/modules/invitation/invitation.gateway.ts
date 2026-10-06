import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/jwt.strategy';
import { InvitationStatsByEvent } from './invitation.service';

export const INVITATION_STATS_EVENT = 'invitation:stats-by-event';

export type StatsChangeSource = 'invitation' | 'event';
export type StatsChangeAction = 'created' | 'updated' | 'deleted';

// `source` + `id` cho biết bản ghi nào vừa đổi khiến số liệu chart thay đổi.
export interface InvitationStatsMessage {
  source: StatsChangeSource;
  action: StatsChangeAction;
  id: number;
  stats: InvitationStatsByEvent;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class InvitationGateway implements OnGatewayInit {
  private readonly logger = new Logger(InvitationGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  constructor(private readonly jwtService: JwtService) {}

  // Chặn ngay lúc handshake: client phải gửi JWT giống REST API,
  // qua `auth: { token }` hoặc header `Authorization: Bearer <token>`.
  afterInit(server: Server): void {
    server.use((socket: Socket, next) => {
      const token = this.extractToken(socket);
      if (!token) {
        return next(new Error('Unauthorized'));
      }
      this.jwtService
        .verifyAsync<JwtPayload>(token)
        .then((payload) => {
          (socket.data as { user?: JwtPayload }).user = payload;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });
  }

  emitStats(message: InvitationStatsMessage): void {
    this.server.emit(INVITATION_STATS_EVENT, message);
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as { token?: unknown };
    if (typeof auth?.token === 'string') {
      return auth.token.replace(/^Bearer\s+/i, '');
    }
    const header = socket.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    this.logger.debug(`Socket ${socket.id} connected without token`);
    return undefined;
  }
}
