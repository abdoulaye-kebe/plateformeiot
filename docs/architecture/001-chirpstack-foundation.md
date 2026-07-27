# ADR-001 : ChirpStack comme cœur LoRaWAN

## Statut

Accepté — Phase 0

## Contexte

La plateforme doit supporter LoRaWAN 1.0.x/1.1, classes A/B/C, OTAA, ADR, multicast, FUOTA, etc. Réimplémenter un Network Server from scratch représente 12–18 mois de R&D.

## Décision

Utiliser **ChirpStack v4** comme cœur LoRaWAN (NS, JS, AS, Gateway Bridge) et construire la valeur SaaS **au-dessus** :

- Multi-tenancy SaaS (PostgreSQL platform)
- Platform API (Go) — proxy + enrichissement
- Agent IA via MCP (Python)
- Console Next.js
- Billing, Rule Engine, Analytics (phases suivantes)

## Conséquences

**Positives :**
- Time-to-market rapide
- Stack LoRaWAN mature et open-source
- REST API via `chirpstack-rest-api`

**Négatives :**
- Dépendance à ChirpStack pour le core MAC
- Multi-tenant ChirpStack natif ≠ multi-tenant SaaS (mapping requis)

## Mapping tenant

```
SaaS Tenant (platform.tenants)
    └── chirpstack_tenant_id → ChirpStack Tenant
         └── Applications, Devices, Gateways
```

## Agent IA — MCP

```
┌──────────────┐     SSE/stdio     ┌─────────────────┐
│ MCP Client   │ ◄──────────────► │ MCP Server       │
│ (LLM loop)   │                   │ (FastMCP tools) │
└──────────────┘                   └────────┬────────┘
                                          │ REST
                                 ┌────────▼────────┐
                                 │ ChirpStack API  │
                                 └─────────────────┘
```

Les tools MCP encapsulent la logique métier (diagnostics, batterie, réseau) sans exposer l'API brute au LLM.
