import { Module } from "@nestjs/common";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { AuditLogModule } from "../audit-log/audit-log.module";

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService): JwtModuleOptions => ({
    secret: config.get<string>("JWT_SECRET"),
    signOptions: {
      expiresIn: config.get<string>("JWT_EXPIRES_IN", "7d") as string,
    } as JwtModuleOptions["signOptions"],
  }),
});

@Module({
  imports: [ConfigModule, jwtModule, AuditLogModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, jwtModule],
})
export class AuthModule {}
