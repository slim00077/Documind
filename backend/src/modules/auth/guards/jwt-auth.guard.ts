import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { Role } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { enterWorkspace, parseWorkspaceHeader } from "../../access/workspace-context";

export type AuthTokenPayload = {
  userId: number;
  role: Role;
};

export type AuthenticatedRequest = Request & {
  user: AuthTokenPayload;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException("Authentication token is required");
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException(
        "Authorization header must be: Bearer <token>",
      );
    }

    let payload: AuthTokenPayload;

    try {
      payload = this.jwtService.verify<AuthTokenPayload>(token);

      if (
        typeof payload.userId !== "number" ||
        !Object.values(Role).includes(payload.role)
      ) {
        throw new Error("Invalid token payload");
      }
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // The JWT's role is only a snapshot from sign-in time; re-checking the
    // live record here means an admin disabling a user or changing their
    // role takes effect immediately, without waiting for token expiry.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("This account is no longer active");
    }

    // Optional workspace selector. The header is a hint only: an organization workspace is
    // honoured solely if the caller is an ACTIVE member of that ACTIVE organization.
    const organizationId = parseWorkspaceHeader(request.headers["x-workspace"]);
    if (organizationId === undefined) {
      throw new ForbiddenException("Invalid workspace");
    }
    if (organizationId !== null) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { organizationId, userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } },
        select: { id: true },
      });
      // The stable `code` lets the web client react to a lost membership whatever the message language.
      if (!membership) {
        throw new ForbiddenException({
          statusCode: 403,
          message: "You are not an active member of this organization",
          error: "Forbidden",
          code: "WORKSPACE_MEMBERSHIP_INACTIVE",
        });
      }
    }
    enterWorkspace({ userId: user.id, organizationId });

    (request as AuthenticatedRequest).user = {
      userId: user.id,
      role: user.role,
    };

    return true;
  }
}
