import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { MessagesWsService } from './messages-ws.service';
import { Server, Socket } from 'socket.io';
import { NewMessageDto } from './dtos/new-message.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from 'src/auth/interfaces';

@WebSocketGateway({ cors: true })
export class MessagesWsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() wss: Server;

  constructor(
    private readonly messagesWsService: MessagesWsService,
    private readonly jwtService: JwtService,
  ) {}
  async handleConnection(client: Socket) {
    const token = client.handshake.headers.authentication as string;
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(token);
      await this.messagesWsService.registerClient(client, payload.id);
    } catch (error) {
      client.disconnect();
      return;
    }
    // console.log(payload)
    this.wss.emit(
      'clients-updated',
      this.messagesWsService.getConnectedClients(),
    );
  }
  handleDisconnect(client: Socket) {
    // console.log('Cliente desconectado:', client.id);
    this.messagesWsService.removeClient(client);
  }

  @SubscribeMessage('message-from-client')
  handleMessageFromClient(client: Socket, payload: NewMessageDto) {
    //añade el cliente al namespace chat
    // client.join('chat');

    //emite unicamente al cliente que lo mando
    // client.emit('message-from-server', {
    //   fullName: 'Juan Perez',
    //   message: payload.message || 'no message',
    // });

    //emite a todos menos al cliente que lo mando
    // client.broadcast.emit('message-from-server', {
    //   fullName: 'Juan Perez',
    //   message: payload.message || 'no message',
    // });

    //emite a un namespace diferente
    // this.wss.to('chat').emit('message-from-server', {

    // emite a todos
    this.wss.emit('message-from-server', {
      fullName: this.messagesWsService.getUserFullName(client.id),
      message: payload.message || 'no message',
    });
  }
}
