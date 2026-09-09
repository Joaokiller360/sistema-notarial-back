import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeGateway } from "./realtime.gateway";

/**
 * Módulo transversal. Lo importan TasksModule, NotificationsModule, NewsModule
 * y AuthModule para inyectar RealtimeGateway. No depende de ninguno de ellos.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
