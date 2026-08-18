"""Exécution d'outils HTTP personnalisables par tenant."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

_PLACEHOLDER = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def apply_template(template: str, args: dict[str, Any]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in args:
            return match.group(0)
        return str(args[key])

    return _PLACEHOLDER.sub(repl, template)


def custom_tool_to_openai_schema(tool: dict[str, Any]) -> dict[str, Any]:
    params = tool.get("parameters") or {"type": "object", "properties": {}}
    if isinstance(params, str):
        params = json.loads(params)
    return {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description") or "",
            "parameters": params,
        },
    }


async def run_custom_http_tool(tool: dict[str, Any], args: dict[str, Any]) -> str:
    method = (tool.get("httpMethod") or tool.get("http_method") or "GET").upper()
    url = apply_template(tool.get("urlTemplate") or tool.get("url_template") or "", args)
    headers_raw = tool.get("headers") or {}
    if isinstance(headers_raw, str):
        headers_raw = json.loads(headers_raw)
    headers = {str(k): str(v) for k, v in headers_raw.items()}

    body_template = tool.get("bodyTemplate") or tool.get("body_template")
    content: str | None = None
    json_body: dict[str, Any] | None = None
    if body_template:
        rendered = apply_template(body_template, args)
        try:
            json_body = json.loads(rendered)
        except json.JSONDecodeError:
            content = rendered

    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            resp = await client.request(method, url, headers=headers, json=json_body, content=content)
        except httpx.HTTPError as exc:
            return json.dumps({"error": str(exc), "url": url}, ensure_ascii=False)

    text = resp.text[:8000]
    return json.dumps(
        {
            "status": resp.status_code,
            "url": url,
            "body": text,
        },
        ensure_ascii=False,
    )
