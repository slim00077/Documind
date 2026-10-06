import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type {
  AuthenticatedRequest,
  AuthTokenPayload,
} from "../guards/jwt-auth.guard";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthTokenPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
