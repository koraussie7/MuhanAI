FROM python:3.11-slim

WORKDIR /app

# Install system deps for torch CPU
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY services/fast-decider/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/fast-decider/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]