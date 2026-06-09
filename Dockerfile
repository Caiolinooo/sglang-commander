# Stage 1: Build the frontend React app
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend FastAPI app
FROM python:3.10-slim
WORKDIR /app

# Install system dependencies (curl, git, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files and root entry point
COPY backend/ ./backend
COPY main.py .

# Copy built frontend assets
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose ports
EXPOSE 8000

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=8000
ENV PRODUCTION=true

# Command to run SGLang Commander
CMD ["python", "main.py"]
