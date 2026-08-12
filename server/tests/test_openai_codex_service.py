import asyncio
import base64
import json
import time
from urllib.parse import parse_qs

import httpx

from app.config import get_settings
from app.providers.openai_subscription import OpenAISubscriptionProvider
from app.schemas.ai import ExtractionContext, InsightSnapshot
from app.services.openai_codex import (
    CODEX_RESPONSES_URL,
    OPENAI_DEVICE_CODE_URL,
    OPENAI_DEVICE_TOKEN_URL,
    OPENAI_TOKEN_URL,
    OAuthCredentials,
    OpenAICodexService,
)


def jwt(claims: dict[str, object]) -> str:
    encoded = base64.urlsafe_b64encode(
        json.dumps(claims, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    return f"header.{encoded}.signature"


def test_device_oauth_is_server_side_and_encrypted(tmp_path):
    account_token = jwt(
        {
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "account_test",
                "chatgpt_plan_type": "plus",
            },
            "exp": int(time.time()) + 3600,
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == OPENAI_DEVICE_CODE_URL:
            assert json.loads(request.content) == {
                "client_id": "app_EMoamEEZ73f0CkXaXp7hrann"
            }
            return httpx.Response(
                200,
                json={
                    "device_auth_id": "device-secret",
                    "user_code": "TEST-CODE",
                    "interval": 1,
                },
            )
        if str(request.url) == OPENAI_DEVICE_TOKEN_URL:
            assert json.loads(request.content) == {
                "device_auth_id": "device-secret",
                "user_code": "TEST-CODE",
            }
            return httpx.Response(
                200,
                json={"authorization_code": "auth-code", "code_verifier": "verifier"},
            )
        if str(request.url) == OPENAI_TOKEN_URL:
            form = parse_qs(request.content.decode())
            assert form["grant_type"] == ["authorization_code"]
            assert form["redirect_uri"] == ["https://auth.openai.com/deviceauth/callback"]
            return httpx.Response(
                200,
                json={
                    "access_token": account_token,
                    "refresh_token": "refresh-secret",
                    "id_token": account_token,
                },
            )
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    async def scenario() -> None:
        settings = get_settings().model_copy(update={"data_dir": tmp_path})
        service = OpenAICodexService(settings, transport=httpx.MockTransport(handler))
        started = await service.start_device_login()
        assert started == {
            "loginId": started["loginId"],
            "verificationUrl": "https://auth.openai.com/codex/device",
            "userCode": "TEST-CODE",
        }
        status = await service.login_status(started["loginId"])
        assert status == {"connected": True, "planType": "plus", "status": "connected"}
        encrypted = settings.openai_oauth_path.read_bytes()
        assert b"refresh-secret" not in encrypted
        assert b"account_test" not in encrypted
        assert (await service.account_status()) == {"connected": True, "planType": "plus"}
        await service.close()

    asyncio.run(scenario())


def test_model_catalog_is_live_and_refreshes_after_unauthorized(tmp_path):
    calls = {"models": 0, "refresh": 0}
    refreshed_token = jwt({"chatgpt_account_id": "account_test"})

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/backend-api/codex/models":
            calls["models"] += 1
            assert request.headers["ChatGPT-Account-Id"] == "account_test"
            if calls["models"] == 1:
                assert request.headers["Authorization"] == "Bearer old-access"
                return httpx.Response(401)
            assert request.headers["Authorization"] == f"Bearer {refreshed_token}"
            assert request.url.params["client_version"]
            return httpx.Response(
                200,
                json={
                    "models": [
                        {
                            "slug": "gpt-visible",
                            "display_name": "GPT Visible",
                            "description": "Vision model",
                            "default_reasoning_level": "high",
                            "visibility": "list",
                            "supported_in_api": True,
                            "priority": 2,
                        },
                        {
                            "slug": "gpt-hidden",
                            "visibility": "hide",
                            "supported_in_api": True,
                        },
                    ]
                },
            )
        if str(request.url) == OPENAI_TOKEN_URL:
            calls["refresh"] += 1
            form = parse_qs(request.content.decode())
            assert form == {
                "grant_type": ["refresh_token"],
                "refresh_token": ["refresh-secret"],
                "client_id": ["app_EMoamEEZ73f0CkXaXp7hrann"],
            }
            return httpx.Response(
                200,
                json={
                    "access_token": refreshed_token,
                    "refresh_token": "new-refresh-secret",
                    "expires_in": 3600,
                },
            )
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    async def scenario() -> None:
        settings = get_settings().model_copy(update={"data_dir": tmp_path})
        service = OpenAICodexService(settings, transport=httpx.MockTransport(handler))
        service._save_credentials(
            OAuthCredentials(
                access_token="old-access",
                refresh_token="refresh-secret",
                expires_at=9_999_999_999,
                account_id="account_test",
                plan_type="pro",
            )
        )
        models = await service.list_models()
        assert [model["id"] for model in models] == ["gpt-visible"]
        assert models[0]["isDefault"] is True
        assert calls == {"models": 2, "refresh": 1}
        await service.close()

    asyncio.run(scenario())


def test_model_catalog_recommends_terra_only_when_entitled(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/backend-api/codex/models"
        return httpx.Response(
            200,
            json={
                "models": [
                    {
                        "slug": "gpt-5.6-sol",
                        "display_name": "GPT-5.6 Sol",
                        "visibility": "list",
                        "supported_in_api": True,
                        "priority": 1,
                    },
                    {
                        "slug": "gpt-5.6-luna",
                        "display_name": "GPT-5.6 Luna",
                        "visibility": "list",
                        "supported_in_api": True,
                        "priority": 2,
                    },
                    {
                        "slug": "gpt-5.6-terra",
                        "display_name": "GPT-5.6 Terra",
                        "visibility": "list",
                        "supported_in_api": True,
                        "priority": 3,
                    },
                ]
            },
        )

    async def scenario() -> None:
        settings = get_settings().model_copy(update={"data_dir": tmp_path})
        service = OpenAICodexService(settings, transport=httpx.MockTransport(handler))
        service._save_credentials(
            OAuthCredentials(
                access_token="access-secret",
                refresh_token="refresh-secret",
                expires_at=9_999_999_999,
                account_id="account_test",
            )
        )

        models = await service.list_models()

        assert {model["id"] for model in models} == {
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
        }
        assert [model["id"] for model in models if model["isDefault"]] == [
            "gpt-5.6-terra"
        ]
        await service.close()

    asyncio.run(scenario())


def test_structured_completion_disables_tools_and_parses_sse(tmp_path):
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == CODEX_RESPONSES_URL
        assert request.headers["Authorization"] == "Bearer access-secret"
        assert request.headers["ChatGPT-Account-Id"] == "account_test"
        captured.update(json.loads(request.content))
        events = [
            {"type": "response.output_text.delta", "delta": '{"ok":'},
            {"type": "response.output_text.delta", "delta": "true}"},
            {"type": "response.completed", "response": {"id": "response-test"}},
        ]
        body = "".join(f"data: {json.dumps(event)}\n\n" for event in events)
        return httpx.Response(200, text=body, headers={"Content-Type": "text/event-stream"})

    async def scenario() -> None:
        settings = get_settings().model_copy(update={"data_dir": tmp_path})
        service = OpenAICodexService(settings, transport=httpx.MockTransport(handler))
        service._save_credentials(
            OAuthCredentials(
                access_token="access-secret",
                refresh_token="refresh-secret",
                expires_at=9_999_999_999,
                account_id="account_test",
            )
        )
        output = await service.structured_completion(
            model="gpt-5.6-terra",
            prompt="Extract the receipt",
            output_schema={
                "type": "object",
                "properties": {"ok": {"type": "boolean", "default": False}},
            },
            image_bytes=b"image",
            mime_type="image/webp",
            reasoning_effort="low",
        )
        assert output == '{"ok":true}'
        assert captured["tools"] == []
        assert "tool_choice" not in captured
        assert "parallel_tool_calls" not in captured
        assert captured["reasoning"] == {
            "effort": "low",
            "context": "current_turn",
        }
        assert "include" not in captured
        assert captured["store"] is False
        assert captured["stream"] is True
        schema = captured["text"]["format"]["schema"]
        assert schema["required"] == ["ok"]
        assert schema["additionalProperties"] is False
        image = captured["input"][0]["content"][1]
        assert image["image_url"] == "data:image/webp;base64,aW1hZ2U="
        assert image["detail"] == "original"
        await service.close()

    asyncio.run(scenario())


def test_subscription_provider_applies_backend_reasoning_effort_to_both_tasks():
    calls: list[dict[str, object]] = []

    class FakeService:
        async def structured_completion(self, **kwargs):
            calls.append(kwargs)
            if kwargs.get("image_bytes") is not None:
                return '{"schemaVersion":1,"documentType":"receipt"}'
            return '{"observations":[],"suggestion":null}'

    async def scenario() -> None:
        provider = OpenAISubscriptionProvider(
            "gpt-5.6-terra", FakeService(), reasoning_effort="high"
        )
        await provider.extract_receipt(
            b"image", "image/webp", ExtractionContext(locale="it-IT", currency="EUR")
        )
        await provider.generate_insights(InsightSnapshot(
            locale="it-IT",
            currency="EUR",
            period={},
            total=0,
            previousTotal=0,
            categories=[],
            merchants=[],
            items=[],
            priceChanges=[],
        ))

        assert [call["reasoning_effort"] for call in calls] == ["high", "high"]

    asyncio.run(scenario())
