import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.routes import ai, auth, files, health, sync
from app.services.ai_queue import configure_ai_worker_health, supervise_ai_worker
from app.services.openai_codex import close_openai_codex_service

logger = logging.getLogger("bianco")
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(message)s"))
logger.handlers = [handler]
logger.setLevel(logging.INFO)
logger.propagate = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.files_dir.mkdir(parents=True, exist_ok=True)
    worker = None
    configure_ai_worker_health(settings.ai_worker_enabled)
    if settings.ai_worker_enabled:
        worker = asyncio.create_task(
            supervise_ai_worker(settings), name="bianco-ai-worker-supervisor"
        )
    try:
        yield
    finally:
        if worker is not None:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
        await close_openai_codex_service()


app = FastAPI(
    title="Bianco API",
    version="0.2.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="bianco_session",
    max_age=settings.session_max_age_seconds,
    same_site="strict",
    https_only=settings.session_cookie_secure,
)


@app.middleware("http")
async def structured_request_log(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))[:128]
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        logger.info(
            json.dumps(
                {
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "level": "info" if status_code < 500 else "error",
                    "request_id": request_id,
                    "method": request.method,
                    "route": request.url.path,
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
                separators=(",", ":"),
            )
        )


app.include_router(auth.router)
app.include_router(health.router)
app.include_router(sync.router)
app.include_router(files.router)
app.include_router(ai.router)
