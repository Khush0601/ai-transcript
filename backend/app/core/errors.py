import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def _error_code(status_code: int) -> str:
    codes = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        413: "payload_too_large",
        422: "validation_error",
        429: "rate_limited",
    }
    return codes.get(status_code, "http_error")


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


async def handle_http_error(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    del request
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return _error_response(exc.status_code, _error_code(exc.status_code), message)


async def handle_validation_error(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    del request, exc
    return _error_response(
        422,
        "validation_error",
        "Request validation failed.",
    )


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled request error",
        extra={
            "path": request.url.path,
            "method": request.method,
            "error_type": type(exc).__name__,
        },
    )
    return _error_response(
        500,
        "internal_error",
        "An unexpected error occurred.",
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, handle_http_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
