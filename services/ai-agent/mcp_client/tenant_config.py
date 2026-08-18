"""Configuration agent par tenant — prompt, outils MCP filtrés, outils HTTP custom."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TenantAgentConfig:
    display_name: str = "Agent IA"
    system_prompt: str = ""
    welcome_message: str = ""
    suggestions: list[str] = field(default_factory=list)
    enabled_builtin_tools: list[str] = field(default_factory=list)
    custom_tools: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_payload(cls, data: dict[str, Any] | None) -> TenantAgentConfig | None:
        if not data:
            return None
        custom = data.get("customTools") or data.get("custom_tools") or []
        enabled = data.get("enabledBuiltinTools") or data.get("enabled_builtin_tools") or []
        return cls(
            display_name=str(data.get("displayName") or data.get("display_name") or "Agent IA"),
            system_prompt=str(data.get("systemPrompt") or data.get("system_prompt") or ""),
            welcome_message=str(data.get("welcomeMessage") or data.get("welcome_message") or ""),
            suggestions=list(data.get("suggestions") or []),
            enabled_builtin_tools=list(enabled),
            custom_tools=list(custom),
        )

    def builtin_allowed(self, name: str) -> bool:
        if not self.enabled_builtin_tools:
            return True
        return name in self.enabled_builtin_tools

    def custom_by_name(self) -> dict[str, dict[str, Any]]:
        return {str(t.get("name")): t for t in self.custom_tools if t.get("name")}
