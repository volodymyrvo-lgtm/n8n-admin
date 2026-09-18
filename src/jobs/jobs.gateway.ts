import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types/jwt-payload.type.js';
import type { JobResponseDto } from './dto/job-response.dto.js';

/**
 * Реальний захист з'єднання — це перевірка JWT у handleConnection, а не
 * CORS тут: cors:true навмисно, бо @WebSocketGateway({cors}) обчислюється
 * як звичайний аргумент декоратора в момент завантаження класу — це
 * відбувається ДО того, як ConfigModule.forRoot() встигає підвантажити
 * .env, тож читати звідти CORS_ORIGINS тут ненадійно.
 */
@WebSocketGateway({
  namespace: 'jobs',
  cors: { origin: true, credentials: true },
})
@Injectable()
export class JobsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(JobsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = JobsGateway.extractToken(client);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      client.data.user = payload;
      this.logger.log(`WS підключився: ${payload.username}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data.user as JwtPayload | undefined;
    if (user) {
      this.logger.log(`WS відключився: ${user.username}`);
    }
  }

  /** Розсилає оновлену джобу всім підключеним клієнтам namespace /jobs. */
  emitJobUpdated(job: JobResponseDto): void {
    this.server.emit('job.updated', job);
  }

  /** Токен передається або через auth.token (рекомендовано для socket.io-client), або через заголовок Authorization: Bearer. */
  private static extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.['token'] as string | undefined;
    if (fromAuth) {
      return fromAuth;
    }

    const header = client.handshake.headers.authorization;
    const [type, token] = header?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
