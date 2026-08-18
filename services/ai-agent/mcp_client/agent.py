"""Client MCP + orchestrateur LLM (Ollama CPU ou OpenAI) pour l'agent IoT LoRaWAN."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from fastmcp import Client

from mcp_client.custom_tools import custom_tool_to_openai_schema, run_custom_http_tool
from mcp_client.formatters import format_tool_result
from mcp_client.llm import create_llm_client
from mcp_client.nlp_router import route_natural_language
from mcp_client.tenant_config import TenantAgentConfig

SYSTEM_PROMPT = """Tu es l'agent IA de la plateforme LoRaWAN SaaS (ChirpStack).
Tu disposes d'outils MCP pour lire/écrire gateways & devices, métriques radio (RSSI, SNR, SF/DR), events et diagnostics.

Règles :
- Réponds en français, concis et actionnable (NOC/SOC).
- Utilise les outils avant de conclure quand des données réseau sont nécessaires.
- Pour supprimer (delete_*), confirm=true uniquement après accord explicite de l'utilisateur.
- Cite DevEUI et Gateway ID."""

SHENGDA_PROMPT_ADDON = """
Outils compteurs d'eau Shengda disponibles : index m³, batterie, vanne, downlinks.
- Privilégie get_water_meter_telemetry(dev_eui) en lecture.
- Pour vanne ou intervalle de relevé : send_water_meter_command (open/close/read/set_report_interval/set_report_hour)."""

PLANNER_PROMPT = """Tu es un planificateur d'outils LoRaWAN.
Analyse la demande utilisateur et réponds UNIQUEMENT avec un JSON valide (sans markdown) :

{{"action":"tool","name":"<nom_tool>","arguments":{{...}}}}
ou
{{"action":"answer","text":"<réponse directe si aucun outil nécessaire>"}}

Outils disponibles :
{tools}

Exemples :
- "vue réseau" → {{"action":"tool","name":"network_overview","arguments":{{}}}}
- "liste gateways" → {{"action":"tool","name":"list_gateways","arguments":{{"limit":20}}}}
- "SNR device abc..." → {{"action":"tool","name":"get_device_radio_info","arguments":{{"dev_eui":"abc..."}}}}"""


class LoRaWANAgent:
    def __init__(
        self,
        mcp_url: str | None = None,
        model: str | None = None,
        verbose: bool = False,
        fast: bool = True,
    ) -> None:
        self.mcp_url = mcp_url or os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8095/sse")
        self.provider = os.getenv("LLM_PROVIDER", "ollama").lower()
        self.model = model or os.getenv("LLM_MODEL", "mistral:latest")
        self.verbose = verbose or os.getenv("AGENT_VERBOSE", "").lower() in ("1", "true", "yes")
        self.fast = fast and os.getenv("AGENT_FAST", "true").lower() not in ("0", "false", "no")
        self.llm: Any = None
        self._llm_error: str | None = None
        self._last_form: str | None = None
        self._tenant_config: TenantAgentConfig | None = None
        self._chirpstack_tenant_id: str = ""
        try:
            self.llm, default_model = create_llm_client()
            if not model:
                self.model = default_model
        except Exception as exc:  # noqa: BLE001
            self._llm_error = str(exc)

    def _log(self, msg: str) -> None:
        if self.verbose:
            print(msg, flush=True)

    def set_tenant_config(self, config: TenantAgentConfig | None) -> None:
        self._tenant_config = config

    def set_chirpstack_tenant_id(self, tenant_id: str | None) -> None:
        self._chirpstack_tenant_id = (tenant_id or "").strip()

    def _mcp_client(self) -> Client:
        if self._chirpstack_tenant_id:
            from fastmcp.client.transports.sse import SSETransport

            transport = SSETransport(
                self.mcp_url,
                headers={"X-ChirpStack-Tenant-Id": self._chirpstack_tenant_id},
            )
            return Client(transport)
        return Client(self.mcp_url)

    def _system_prompt(self) -> str:
        if self._tenant_config and self._tenant_config.system_prompt.strip():
            return self._tenant_config.system_prompt.strip()
        base = SYSTEM_PROMPT
        if self._tenant_config and self._tenant_config.shengda_tools_enabled():
            base += SHENGDA_PROMPT_ADDON
        return base

    async def list_tools(self, tenant_config: TenantAgentConfig | None = None) -> list[dict[str, Any]]:
        cfg = tenant_config or self._tenant_config
        out: list[dict[str, Any]] = []
        async with self._mcp_client() as client:
            tools = await client.list_tools()
            for t in tools:
                if cfg and not cfg.builtin_allowed(t.name):
                    continue
                out.append({"name": t.name, "description": t.description, "kind": "mcp"})
        if cfg:
            for t in cfg.custom_tools:
                if not t.get("name"):
                    continue
                out.append(
                    {
                        "name": t["name"],
                        "description": t.get("description") or "",
                        "kind": "custom",
                    }
                )
        return out

    async def ask(
        self,
        question: str,
        max_tool_rounds: int = 8,
        tenant_config: TenantAgentConfig | None = None,
    ) -> str:
        self._last_form = None
        self._tenant_config = tenant_config or self._tenant_config
        if self.provider == "ollama":
            return await self._ask_ollama_hybrid(question, max_tool_rounds)
        if not self.llm:
            return await self._fallback_without_llm(question)
        return await self._ask_openai_tools(question, max_tool_rounds)

    async def _ask_openai_tools(self, question: str, max_tool_rounds: int) -> str:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "user", "content": question},
        ]

        async with self._mcp_client() as client:
            openai_tools = await self._openai_tools(client)

            for _ in range(max_tool_rounds):
                try:
                    response = self.llm.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        tools=openai_tools or None,
                        temperature=0.2,
                    )
                except Exception as exc:  # noqa: BLE001
                    return f"Erreur LLM ({self.model}): {exc}"

                message = response.choices[0].message
                if not message.tool_calls:
                    return message.content or "Aucune réponse."

                messages.append(message.model_dump())
                for tool_call in message.tool_calls:
                    args = json.loads(tool_call.function.arguments or "{}")
                    content = await self._run_tool(client, tool_call.function.name, args)
                    messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": content})

            return "Nombre maximum d'appels d'outils atteint."

    async def _ask_ollama_hybrid(self, question: str, max_rounds: int) -> str:
        """Mode hybride pour modèles CPU — fast-path MCP puis Ollama si nécessaire."""
        async with self._mcp_client() as client:
            # Fast-path : requêtes courantes sans attendre Ollama (30-60s sur CPU)
            routed = route_natural_language(question) if self.fast else None
            if routed:
                name, args = routed
                if name == "__hint__":
                    self._last_form = args.get("_form")
                    return str(args.get("message", ""))
                if self._tenant_config and not self._tenant_config.builtin_allowed(name):
                    routed = None
                else:
                    intent = args.pop("_intent", None)
                    self._log(f"→ MCP direct (sans LLM) : {name}")
                    result = await self._run_tool(client, name, args)
                    return format_tool_result(name, result, intent=intent)

            if not self.llm:
                return await self._fallback_without_llm(question)

            self._log(f"→ Planification Ollama ({self.model}) …")
            tools = await client.list_tools()
            catalog_lines = []
            for t in tools:
                if self._tenant_config and not self._tenant_config.builtin_allowed(t.name):
                    continue
                catalog_lines.append(f"- {t.name}: {t.description}")
            if self._tenant_config:
                for ct in self._tenant_config.custom_tools:
                    catalog_lines.append(f"- {ct.get('name')}: {ct.get('description')}")
            tool_catalog = "\n".join(catalog_lines)
            messages = [
                {"role": "system", "content": PLANNER_PROMPT.format(tools=tool_catalog)},
                {"role": "user", "content": question},
            ]

            tool_results: list[dict[str, Any]] = []

            for _ in range(max_rounds):
                try:
                    plan_resp = self.llm.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        temperature=0.1,
                    )
                except Exception as exc:  # noqa: BLE001
                    self._log(f"Ollama indisponible: {exc}")
                    return await self._fallback_with_client(client, question, ollama_error=str(exc))

                plan_text = plan_resp.choices[0].message.content or ""
                plan = _parse_json_plan(plan_text)
                if not plan:
                    return plan_text or "Impossible d'interpréter la demande."

                if plan.get("action") == "answer":
                    return str(plan.get("text", ""))

                if plan.get("action") != "tool":
                    return plan_text

                name = plan.get("name")
                args = plan.get("arguments") or {}
                if not name:
                    return plan_text

                result = await self._run_tool(client, str(name), args)
                tool_results.append({"tool": name, "arguments": args, "result": result})
                # Une seule synthèse LLM après le premier tool (évite 2-3 appels CPU)
                self._log(f"→ Synthèse Ollama …")
                return self._synthesize(question, tool_results)

            return "Nombre maximum d'appels d'outils atteint."

    def _synthesize(self, question: str, tool_results: list[dict[str, Any]]) -> str:
        if not tool_results:
            return "Aucune donnée collectée."
        first = tool_results[0]
        fallback = format_tool_result(str(first.get("tool", "")), str(first.get("result", "")))
        if not self.llm:
            return fallback
        summary_prompt = (
            f"Question: {question}\n\nDonnées:\n{json.dumps(tool_results, ensure_ascii=False)[:4000]}\n\n"
            "Réponse courte en français pour un opérateur NOC (5-8 lignes max)."
        )
        try:
            final = self.llm.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": summary_prompt},
                ],
                temperature=0.3,
            )
            return final.choices[0].message.content or fallback
        except Exception as exc:  # noqa: BLE001
            return f"{fallback}\n\n(Synthèse LLM indisponible: {exc})"

    async def _run_tool(self, client: Client, name: str, args: dict[str, Any]) -> str:
        custom = self._tenant_config.custom_by_name() if self._tenant_config else {}
        if name in custom:
            try:
                return await run_custom_http_tool(custom[name], args)
            except Exception as exc:  # noqa: BLE001
                return json.dumps({"error": str(exc)}, ensure_ascii=False)
        if self._tenant_config and not self._tenant_config.builtin_allowed(name):
            return json.dumps({"error": f"outil {name} non autorisé pour ce tenant"}, ensure_ascii=False)
        try:
            result = await client.call_tool(name, args)
            if result.content:
                return result.content[0].text
            return json.dumps(result.structured_content, ensure_ascii=False)
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    async def _openai_tools(self, client: Client) -> list[dict[str, Any]]:
        tools = await client.list_tools()
        out = []
        for tool in tools:
            if self._tenant_config and not self._tenant_config.builtin_allowed(tool.name):
                continue
            out.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description or "",
                        "parameters": tool.inputSchema or {"type": "object", "properties": {}},
                    },
                }
            )
        if self._tenant_config:
            for ct in self._tenant_config.custom_tools:
                out.append(custom_tool_to_openai_schema(ct))
        return out

    async def _fallback_with_client(
        self, client: Client, question: str, ollama_error: str | None = None
    ) -> str:
        hint = ""
        if ollama_error:
            hint = (
                f"\n\n(Ollama indisponible — traitement direct sans LLM. "
                f"Pour l'assistant complet : lancez « ollama serve ».)"
            )
        elif self._llm_error:
            hint = f"\n\n(LLM indisponible: {self._llm_error})"

        routed = route_natural_language(question)
        if routed:
            name, args = routed
            if name == "__hint__":
                self._last_form = args.get("_form")
                return str(args.get("message", "")) + hint
            intent = args.pop("_intent", None)
            result = await self._run_tool(client, name, args)
            return format_tool_result(name, result, intent=intent) + hint

        return (
            "Commande non reconnue sans LLM. Exemples :\n"
            "- « liste les devices / gateways »\n"
            "- « vue d'ensemble du réseau »\n"
            "- « je veux créer un device avec DevEUI: … JoinEUI: … AppKey: … »"
        ) + hint

    async def _fallback_without_llm(self, question: str) -> str:
        async with self._mcp_client() as client:
            return await self._fallback_with_client(
                client, question, ollama_error=self._llm_error or "LLM non configuré"
            )


def _parse_json_plan(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return None
    return None
