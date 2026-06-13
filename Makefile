.PHONY: dev-backend dev-frontend test-backend test-frontend build-frontend test

dev-backend:
	uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

test-backend:
	UV_CACHE_DIR=/tmp/uv-cache uv run --group dev pytest

test-frontend:
	cd frontend && npm test

build-frontend:
	cd frontend && npm run build

test: test-backend test-frontend build-frontend

