FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY shengda_water ./shengda_water
COPY chirpstack ./chirpstack

ENV SHENGDA_WATER_HTTP_PORT=8098
EXPOSE 8098

CMD ["python", "-m", "shengda_water.worker"]
