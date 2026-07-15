from html.parser import HTMLParser

from fastapi.testclient import TestClient

from app.main import app


class HiddenInputParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs):
        if tag != "input":
            return
        attributes = dict(attrs)
        if attributes.get("type") == "hidden" and attributes.get("name"):
            self.values[attributes["name"]] = attributes.get("value", "")


def login_form(client, next_url="/"):
    response = client.get("/auth/login", params={"next": next_url})
    parser = HiddenInputParser()
    parser.feed(response.text)
    return response, parser.values


def sign_in(client, *, username="test-user", password="test-password", next_url="/"):
    _, fields = login_form(client, next_url)
    return client.post(
        "/auth/login",
        data={
            "username": username,
            "password": password,
            "csrf_token": fields["csrf_token"],
            "next": fields["next"],
        },
        follow_redirects=False,
    )


def test_login_page_sets_hardened_session_cookie(client):
    response, fields = login_form(client)
    assert response.status_code == 200
    assert len(fields["csrf_token"]) >= 32
    cookie = response.headers["set-cookie"].lower()
    assert "bianco_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "secure" not in cookie
    assert response.headers["cache-control"] == "no-store"


def test_login_rejects_missing_csrf(client):
    response = client.post(
        "/auth/login",
        data={"username": "test-user", "password": "test-password", "csrf_token": "invalid"},
    )
    assert response.status_code == 400
    assert "form expired" in response.text


def test_login_rejects_credentials_with_generic_error(client):
    response = sign_in(client, username="someone", password="wrong-password")
    assert response.status_code == 401
    assert "Invalid username or password" in response.text
    assert "someone" not in response.text


def test_login_accepts_existing_caddy_bcrypt_hash_and_creates_session(client):
    response = sign_in(client, next_url="/archive?period=all")
    assert response.status_code == 303
    assert response.headers["location"] == "/archive?period=all"

    check = client.get(
        "/auth/check",
        headers={"X-Forwarded-Uri": "/", "X-Forwarded-Method": "GET"},
    )
    assert check.status_code == 204


def test_login_blocks_external_redirects(client):
    response = sign_in(client, next_url="https://attacker.example/")
    assert response.status_code == 303
    assert response.headers["location"] == "/"


def test_forward_auth_redirects_pages_but_returns_401_for_api(client):
    page = client.get(
        "/auth/check",
        headers={"X-Forwarded-Uri": "/archive", "X-Forwarded-Method": "GET"},
        follow_redirects=False,
    )
    assert page.status_code == 303
    assert page.headers["location"].startswith("/auth/login?next=")
    assert "www-authenticate" not in page.headers

    api = client.get(
        "/auth/check",
        headers={"X-Forwarded-Uri": "/api/sync/events", "X-Forwarded-Method": "GET"},
    )
    assert api.status_code == 401
    assert api.json() == {"detail": "Authentication required"}


def test_forward_auth_rejects_cross_origin_mutation(client):
    assert sign_in(client).status_code == 303
    base_headers = {
        "X-Forwarded-Uri": "/api/ai/providers/ollama",
        "X-Forwarded-Method": "PUT",
        "X-Forwarded-Host": "testserver",
    }
    rejected = client.get(
        "/auth/check",
        headers={**base_headers, "Origin": "https://attacker.example"},
    )
    assert rejected.status_code == 403

    allowed = client.get(
        "/auth/check",
        headers={**base_headers, "Origin": "http://testserver"},
    )
    assert allowed.status_code == 204


def test_logout_requires_same_origin_and_clears_session(client):
    assert sign_in(client).status_code == 303
    rejected = client.post(
        "/auth/logout",
        headers={"Origin": "https://attacker.example"},
    )
    assert rejected.status_code == 403

    response = client.post(
        "/auth/logout",
        headers={"Origin": "http://testserver"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/auth/login"

    check = client.get(
        "/auth/check",
        headers={"X-Forwarded-Uri": "/", "X-Forwarded-Method": "GET"},
        follow_redirects=False,
    )
    assert check.status_code == 303


def test_rate_limit_is_enforced():
    with TestClient(app, client=("rate-limit-client", 50000)) as value:
        for _ in range(10):
            assert sign_in(value, password="wrong-password").status_code == 401
        limited = sign_in(value, password="wrong-password")
        assert limited.status_code == 429
        assert int(limited.headers["retry-after"]) > 0
