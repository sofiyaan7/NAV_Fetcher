# The Python half of NAV Terminal.
#
# It cannot go on Vercel: Streamlit's engine needs a persistent process and a
# single AUM pull is allowed an hour, against Vercel's 10-300s function ceiling.
# Any container host works -- Render, Railway, Fly, a VM.
FROM python:3.11-slim

WORKDIR /app

# System deps kept out: pandas/openpyxl ship wheels for slim.
COPY requirements.txt ./
COPY api/requirements.txt ./api-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r api-requirements.txt

COPY . .

# Caches live on disk and are what make a repeat query fast. Mount a volume here
# if the host offers one; without it a restart simply refetches from AMFI.
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# One worker on purpose: the AUM and NAV caches are per-process, and several
# workers would each pay AMFI separately for the same window.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 120"]
