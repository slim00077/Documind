import { type ArgumentsHost, Catch, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import type { Request, Response } from "express";
import { languageOf } from "./language";
import { translateMessage, translateMessageField } from "./translate";

/**
 * Sends error responses in the caller's language (Accept-Language). The response shape is exactly
 * Nest's default ({ statusCode, message, error? } or the exception's own object): only the
 * human-readable `message` changes. English requests and non-HTTP contexts keep the default filter.
 */
@Catch()
@Injectable()
export class I18nExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger("ExceptionsHandler");

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") return super.catch(exception, host);

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const language = languageOf(request);
    if (language === "en" || response.headersSent) return super.catch(exception, host);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === "string"
          ? { statusCode: status, message: translateMessage(body, language) }
          : { ...(body as Record<string, unknown>) };
      if (typeof body !== "string" && "message" in payload) {
        payload.message = translateMessageField(payload.message, language);
      }
      return response.status(status).json(payload);
    }

    // Errors from Express middleware (e.g. body-parser's 413) carry their own status, as in Nest's default filter.
    const httpError = exception as { statusCode?: unknown; message?: unknown } | null;
    if (httpError && typeof httpError.statusCode === "number" && typeof httpError.message === "string") {
      return response.status(httpError.statusCode).json({
        statusCode: httpError.statusCode,
        message: translateMessage(httpError.message, language),
      });
    }

    // Unknown errors: same logging and generic 500 as Nest's default, in the caller's language.
    this.logger.error(exception instanceof Error ? exception.message : String(exception), exception instanceof Error ? exception.stack : undefined);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: translateMessage("Internal server error", language),
    });
  }
}
