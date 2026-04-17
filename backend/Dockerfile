ARG PYTHON_BASE_IMAGE=python:3.11-slim
FROM ${PYTHON_BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# system deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    python -c "import multipart; print('python-multipart ok')"

COPY app ./app
RUN mkdir -p /app/keys
COPY keys ./keys

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
