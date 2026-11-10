import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AiResponseStyle,
  AuditAction,
  Language,
  Role,
  Theme,
} from "../../../generated/prisma/client";
import { AuditLogService } from "../audit-log/audit-log.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";

type SafeUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  theme: Theme;
  aiResponseStyle: AiResponseStyle;
  /** Null until the user picks a language; the client then uses the browser language. */
  language: Language | null;
};

type AuthResponse = {
  user: SafeUser;
  token: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toSafeUser(user: {
    id: number;
    name: string;
    email: string;
    role: Role;
    theme: Theme;
    aiResponseStyle: AiResponseStyle;
    language: Language | null;
  }): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      theme: user.theme,
      aiResponseStyle: user.aiResponseStyle,
      language: user.language,
    };
  }

  private buildAuthResponse(user: SafeUser): AuthResponse {
    return {
      user,
      token: this.jwtService.sign({
        userId: user.id,
        role: user.role,
      }),
    };
  }

  async register(dto: RegisterDto, ipAddress?: string | null): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        // Public sign-ups are always students; privileged roles are admin-granted.
        role: Role.STUDENT,
        // The language the visitor was using when signing up becomes their saved preference.
        ...(dto.language ? { language: dto.language } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        aiResponseStyle: true,
        language: true,
      },
    });

    await this.auditLog.log({
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      action: AuditAction.REGISTER,
      targetType: "User",
      targetId: user.id,
      ipAddress,
    });

    return this.buildAuthResponse(this.toSafeUser(user));
  }

  async login(dto: LoginDto, ipAddress?: string | null): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("This account has been disabled");
    }

    await this.auditLog.log({
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      action: AuditAction.LOGIN,
      targetType: "User",
      targetId: user.id,
      ipAddress,
    });

    return this.buildAuthResponse(this.toSafeUser(user));
  }

  async getCurrentUser(userId: number): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        aiResponseStyle: true,
        language: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Authentication failed");
    }

    return this.toSafeUser(user);
  }

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<SafeUser> {
    const data: { name?: string; email?: string } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const normalizedEmail = this.normalizeEmail(dto.email);
      const existing = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing && existing.id !== userId) {
        throw new ConflictException("Email is already registered");
      }

      data.email = normalizedEmail;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        aiResponseStyle: true,
        language: true,
      },
    });

    return this.toSafeUser(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("Authentication failed");
    }

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!currentMatches) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async updatePreferences(
    userId: number,
    dto: UpdatePreferencesDto,
  ): Promise<SafeUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
        ...(dto.aiResponseStyle !== undefined
          ? { aiResponseStyle: dto.aiResponseStyle }
          : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        aiResponseStyle: true,
        language: true,
      },
    });

    return this.toSafeUser(user);
  }
}
