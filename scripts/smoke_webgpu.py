#!/usr/bin/env python3
"""Poll Bianco's browser smoke fixture through the Chrome DevTools Protocol."""

import argparse
import asyncio
import json
import time
import urllib.error
import urllib.request

import websockets


def browser_pages(port: int) -> list[dict]:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list") as response:
        return json.load(response)


async def evaluate(websocket_url: str, expression: str, request_id: int) -> object:
    async with websockets.connect(websocket_url, max_size=2**20) as socket:
        await socket.send(json.dumps({
            "id": request_id,
            "method": "Runtime.evaluate",
            "params": {"expression": expression, "returnByValue": True},
        }))
        while True:
            message = json.loads(await socket.recv())
            if message.get("id") == request_id:
                return message["result"]["result"].get("value")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9223)
    parser.add_argument("--timeout", type=float, default=45)
    arguments = parser.parse_args()
    deadline = time.monotonic() + arguments.timeout
    request_id = 1

    while time.monotonic() < deadline:
        try:
            pages = browser_pages(arguments.port)
        except (ConnectionError, urllib.error.URLError):
            await asyncio.sleep(0.25)
            continue
        page = next(
            (entry for entry in pages if "webgpu-smoke.html" in entry.get("url", "")),
            None,
        )
        if page:
            value = await evaluate(
                page["webSocketDebuggerUrl"],
                "document.querySelector('#result')?.textContent",
                request_id,
            )
            request_id += 1
            if value and value != "pending":
                result = json.loads(value)
                print(json.dumps(result, ensure_ascii=False, sort_keys=True))
                if result.get("error"):
                    raise SystemExit(1)
                if result.get("mimeType") != "image/webp":
                    raise SystemExit("WebP encoding was not selected")
                if result.get("transform", {}).get("accelerator") != "webgpu":
                    raise SystemExit("WebGPU rectification was not selected")
                if result.get("visual", {}).get("brightRatio", 0) < 0.5:
                    raise SystemExit("Rectified output does not contain the receipt surface")
                if result.get("visual", {}).get("darkRatio", 0) < 0.01:
                    raise SystemExit("Rectified output lost the receipt details")
                return
        await asyncio.sleep(0.25)
    raise SystemExit("Timed out waiting for the WebGPU smoke fixture")


if __name__ == "__main__":
    asyncio.run(main())
