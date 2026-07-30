FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY connector_mcp ./connector_mcp

ENV CONNECTOR_MCP_HTTP_PORT=8097
EXPOSE 8097

CMD ["python", "-m", "connector_mcp.worker"]
