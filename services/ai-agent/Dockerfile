FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY mcp_server ./mcp_server
COPY mcp_client ./mcp_client
COPY scripts ./scripts
RUN chmod +x scripts/start.sh

ENV MCP_TRANSPORT=sse
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8095
ENV MCP_SERVER_URL=http://127.0.0.1:8095/sse
ENV AGENT_HTTP_PORT=8096

EXPOSE 8095 8096
CMD ["scripts/start.sh"]
