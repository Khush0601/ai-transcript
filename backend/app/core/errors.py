import logging
from collections.abc import Mapping

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


def _error_response(
    status_code: int,
    code: str,
    message: str,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


def _request_headers(request: Request) -> dict[str, str]:
    rate_limit_headers = getattr(request.state, "rate_limit_headers", {})
    if not isinstance(rate_limit_headers, dict):
        return {}
    return {
        key: value
        for key, value in rate_limit_headers.items()
        if isinstance(key, str) and isinstance(value, str)
    }


async def handle_http_error(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    headers = {**_request_headers(request), **(exc.headers or {})}
    return _error_response(
        exc.status_code,
        _error_code(exc.status_code),
        message,
        headers,
    )


async def handle_validation_error(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    del exc
    return _error_response(
        422,
        "validation_error",
        "Request validation failed.",
        _request_headers(request),
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
        _request_headers(request),
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, handle_http_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
