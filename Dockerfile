FROM python:3.11-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY . /app/

RUN uv sync --frozen

ENV A1CTF_FLAG="flag{INVALID_FLAG_CONTACT_ADMIN}"

EXPOSE 8000

CMD ["uv", "run", "app.py"]