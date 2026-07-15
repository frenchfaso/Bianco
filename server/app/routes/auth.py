import math
import secrets
import time
from collections import defaultdict, deque
from html import escape
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Form, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])

_password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
_failed_logins: dict[str, deque[float]] = defaultdict(deque)
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _safe_next(value: str | None) -> str:
    candidate = value or "/"
    parsed = urlsplit(candidate)
    if (
        not candidate.startswith("/")
        or candidate.startswith("//")
        or parsed.scheme
        or parsed.netloc
        or "\\" in candidate
        or any(character in candidate for character in ("\r", "\n", "\x00"))
    ):
        return "/"
    return candidate


def _is_authenticated(request: Request) -> bool:
    settings = get_settings()
    username = request.session.get("username")
    return (
        request.session.get("authenticated") is True
        and isinstance(username, str)
        and secrets.compare_digest(username, settings.auth_user)
    )


def _client_key(request: Request) -> str:
    # The API is reachable only from Caddy in production. Caddy normalizes this
    # header, so the final value cannot be supplied directly by the browser.
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[-1].strip()[:128]
    return request.client.host[:128] if request.client else "unknown"


def _prune_failures(key: str, now: float) -> deque[float]:
    settings = get_settings()
    failures = _failed_logins[key]
    cutoff = now - settings.auth_rate_limit_window_seconds
    while failures and failures[0] <= cutoff:
        failures.popleft()
    return failures


def _retry_after(key: str, now: float) -> int | None:
    settings = get_settings()
    failures = _prune_failures(key, now)
    if len(failures) < settings.auth_rate_limit_attempts:
        return None
    return max(1, math.ceil(settings.auth_rate_limit_window_seconds - (now - failures[0])))


def _verify_password(password: str, expected_hash: str) -> bool:
    try:
        return _password_hash.verify(password, expected_hash)
    except (UnknownHashError, ValueError):
        return False


def _same_origin(request: Request) -> bool:
    expected_host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or ""
    ).split(",")[0].strip().lower()
    source = request.headers.get("origin") or request.headers.get("referer")
    if not expected_host or not source:
        return False
    parsed = urlsplit(source)
    if parsed.netloc.lower() != expected_host:
        return False
    if get_settings().session_cookie_secure:
        return parsed.scheme == "https"
    return parsed.scheme in {"http", "https"}


def _login_page(
    request: Request,
    *,
    next_url: str,
    error: str = "",
    status_code: int = status.HTTP_200_OK,
    retry_after: int | None = None,
) -> HTMLResponse:
    csrf_token = request.session.get("login_csrf")
    if not isinstance(csrf_token, str) or len(csrf_token) < 32:
        csrf_token = secrets.token_urlsafe(32)
        request.session["login_csrf"] = csrf_token
    error_markup = (
        f'<p class="error" role="alert">{escape(error)}</p>' if error else ""
    )
    content = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Sign in · Bianco</title>
    <style>
      :root {{ color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
      * {{ box-sizing: border-box; }}
      body {{ min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 1.5rem; background: #eef2ed; color: #173b32; }}
      main {{ width: min(100%, 25rem); padding: 2rem; border: 1px solid #c9d4ce; border-radius: 1.25rem; background: #fff; box-shadow: 0 1.5rem 4rem rgb(23 59 50 / 12%); }}
      h1 {{ margin: 0; font-size: 2rem; letter-spacing: -.04em; }}
      p {{ color: #5b6e67; line-height: 1.5; }}
      label {{ display: grid; gap: .45rem; margin-top: 1rem; font-weight: 650; }}
      input {{ width: 100%; min-height: 3rem; border: 1px solid #9fb1a9; border-radius: .75rem; padding: .75rem .9rem; background: transparent; color: inherit; font: inherit; }}
      input:focus {{ outline: 3px solid rgb(35 107 85 / 25%); border-color: #236b55; }}
      button {{ width: 100%; min-height: 3rem; margin-top: 1.4rem; border: 0; border-radius: .75rem; padding: .75rem 1rem; background: #173b32; color: #fff; font: inherit; font-weight: 750; cursor: pointer; }}
      .error {{ padding: .8rem; border-radius: .7rem; background: #fee7e4; color: #8a261d; }}
      @media (prefers-color-scheme: dark) {{
        body {{ background: #101714; color: #dce9e3; }}
        main {{ background: #17211d; border-color: #33463e; box-shadow: none; }}
        p {{ color: #aabbb3; }}
        input {{ border-color: #5f746a; }}
        button {{ background: #8ecdb8; color: #10231d; }}
        .error {{ background: #4b211e; color: #ffd4cf; }}
      }}
    </style>
  </head>
  <body>
    <main>
      <h1>Bianco</h1>
      <p>Sign in to continue to your receipt archive.</p>
      {error_markup}
      <form method="post" action="/auth/login" autocomplete="on">
        <input type="hidden" name="csrf_token" value="{escape(csrf_token, quote=True)}">
        <input type="hidden" name="next" value="{escape(next_url, quote=True)}">
        <label>Username<input name="username" required maxlength="128" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label>Password<input type="password" name="password" required maxlength="1024" autocomplete="current-password"></label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>"""
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return HTMLResponse(content, status_code=status_code, headers=headers)


@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request, next: str = "/"):
    next_url = _safe_next(next)
    if _is_authenticated(request):
        return RedirectResponse(next_url, status_code=status.HTTP_303_SEE_OTHER)
    return _login_page(request, next_url=next_url)


@router.post("/login")
def login(
    request: Request,
    username: str = Form(..., max_length=128),
    password: str = Form(..., max_length=1024),
    csrf_token: str = Form(..., max_length=256),
    next: str = Form("/", max_length=2048),
):
    next_url = _safe_next(next)
    session_csrf = request.session.get("login_csrf")
    if not isinstance(session_csrf, str) or not secrets.compare_digest(
        csrf_token, session_csrf
    ):
        request.session.clear()
        return _login_page(
            request,
            next_url=next_url,
            error="The sign-in form expired. Please try again.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    key = _client_key(request)
    now = time.monotonic()
    retry_after = _retry_after(key, now)
    if retry_after is not None:
        return _login_page(
            request,
            next_url=next_url,
            error="Too many attempts. Please wait before trying again.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=retry_after,
        )

    settings = get_settings()
    username_valid = secrets.compare_digest(username, settings.auth_user)
    password_valid = _verify_password(password, settings.auth_password_hash)
    if not (username_valid and password_valid):
        _prune_failures(key, now).append(now)
        request.session["login_csrf"] = secrets.token_urlsafe(32)
        return _login_page(
            request,
            next_url=next_url,
            error="Invalid username or password.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    _failed_logins.pop(key, None)
    request.session.clear()
    request.session.update(
        {
            "authenticated": True,
            "username": settings.auth_user,
            "issued_at": int(time.time()),
        }
    )
    return RedirectResponse(next_url, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/check")
def check(request: Request):
    original_uri = _safe_next(request.headers.get("x-forwarded-uri"))
    if not _is_authenticated(request):
        if original_uri.startswith("/api/"):
            return JSONResponse(
                {"detail": "Authentication required"},
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"Cache-Control": "no-store"},
            )
        login_url = f"/auth/login?next={quote(original_uri, safe='')}"
        return RedirectResponse(login_url, status_code=status.HTTP_303_SEE_OTHER)

    original_method = request.headers.get("x-forwarded-method", "GET").upper()
    if original_method not in _SAFE_METHODS and not _same_origin(request):
        return JSONResponse(
            {"detail": "Cross-origin request rejected"},
            status_code=status.HTTP_403_FORBIDDEN,
            headers={"Cache-Control": "no-store"},
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})


@router.post("/logout")
def logout(request: Request):
    if not _same_origin(request):
        return JSONResponse(
            {"detail": "Cross-origin request rejected"},
            status_code=status.HTTP_403_FORBIDDEN,
        )
    request.session.clear()
    return RedirectResponse("/auth/login", status_code=status.HTTP_303_SEE_OTHER)
