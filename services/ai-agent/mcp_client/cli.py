"""CLI — agent LoRaWAN en langage naturel (Ollama CPU ou OpenAI)."""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

from mcp_client.agent import LoRaWANAgent


async def main() -> None:
    parser = argparse.ArgumentParser(description="Agent IA LoRaWAN — langage naturel + MCP")
    parser.add_argument("question", nargs="?", help="Question ou commande en français")
    parser.add_argument("--list-tools", action="store_true", help="Lister les outils MCP")
    parser.add_argument("--mcp-url", default=None, help="URL SSE du serveur MCP")
    parser.add_argument("--model", default=None, help="Modèle LLM (ex: mistral:latest, llama3.2:3b)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Afficher les étapes (MCP direct vs Ollama)")
    parser.add_argument("--no-fast", action="store_true", help="Toujours passer par Ollama (plus lent, moins fiable)")
    args = parser.parse_args()

    agent = LoRaWANAgent(mcp_url=args.mcp_url, model=args.model, verbose=args.verbose, fast=not args.no_fast)

    if args.list_tools:
        tools = await agent.list_tools()
        print(f"Modèle LLM : {agent.model} | Fast-path : {'on' if agent.fast else 'off'}\n")
        for tool in tools:
            print(f"- {tool['name']}: {tool['description']}")
        return

    if not args.question:
        parser.print_help()
        sys.exit(1)

    t0 = time.perf_counter()
    if not args.verbose:
        print(f"[{agent.model}] ", end="", flush=True)

    answer = await agent.ask(args.question)
    elapsed = time.perf_counter() - t0

    if args.verbose:
        print(answer)
        print(f"\n— {elapsed:.1f}s", file=sys.stderr)
    else:
        print(answer)
        if elapsed > 3:
            print(f"({elapsed:.0f}s)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
