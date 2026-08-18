"""Configuration agent par tenant — prompt, outils MCP filtrés, outils HTTP custom."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SHENGDA_TOOL_NAMES = frozenset(
    {
        "list_water_meters",
        "get_latest_water_meter_reading",
        "get_water_meter_telemetry",
        "get_water_meter_readings",
        "decode_water_meter_payload",
        "send_water_meter_command",
        "list_water_meter_commands",
    }
)


@dataclass
class TenantAgentConfig:
    display_name: str = "Agent IA"
    vertical: str = "generic"
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
            vertical=str(data.get("vertical") or "generic"),
            system_prompt=str(data.get("systemPrompt") or data.get("system_prompt") or ""),
            welcome_message=str(data.get("welcomeMessage") or data.get("welcome_message") or ""),
            suggestions=list(data.get("suggestions") or []),
            enabled_builtin_tools=list(enabled),
            custom_tools=list(custom),
        )

    def shengda_tools_enabled(self) -> bool:
        if self.vertical == "water":
            return True
        if self.enabled_builtin_tools:
            return any(name in SHENGDA_TOOL_NAMES for name in self.enabled_builtin_tools)
        return False

    def builtin_allowed(self, name: str) -> bool:
        if name in SHENGDA_TOOL_NAMES and not self.shengda_tools_enabled():
            return False
        if self.enabled_builtin_tools:
            return name in self.enabled_builtin_tools
        return True

    def custom_by_name(self) -> dict[str, dict[str, Any]]:
        return {str(t.get("name")): t for t in self.custom_tools if t.get("name")}
