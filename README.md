# SGLang Commander 🚀

Uma interface desktop e web completa para gerenciar servidores de inferência **SGLang**. Controle modelos, monitore métricas em tempo real, faça chat multimodal e gerencie deploys — tudo de uma interface unificada.

## ✨ Funcionalidades

- **🖥️ Server Control** — Inicie, pare e reinicie servidores SGLang com configurações personalizadas
- **💬 Chat Multimodal** — Chat streaming com suporte a imagem e áudio (TTS/STT)
- **📊 Métricas em Tempo Real** — Gráficos de throughput, latência, cache hit, GPU/VRAM
- **🤗 Model Hub** — Busque modelos no HuggingFace, faça download e deploy com 1 clique
- **📋 Perfis de Servidor** — Salve e gerencie múltiplas configurações de servidor
- **⏱️ Benchmark** — Teste de latência com estatísticas (P50/P95/P99)
- **🌐 Deploy Remoto** — Integração com ZeroTier para conectar servidores remotos
- **🔄 Auto-Update** — Verificação e aplicação de atualizações via GitHub Releases
- **🎨 Temas** — Alternância entre Dark/Light mode

## 🏗️ Arquitetura

```
sglang-commander/
├── backend/          # FastAPI + SQLAlchemy + JWT
│   └── app/
│       ├── api/v1/   # 11 módulos de rotas REST
│       ├── core/     # database, security, deps
│       ├── models/   # SQLAlchemy models
│       ├── schemas/  # Pydantic schemas
│       └── services/ # ServerManager, ModelManager, Auth, etc.
├── frontend/         # React SPA (Vite + Tailwind CSS 4)
│   └── src/
│       ├── pages/    # 10 páginas
│       ├── api/      # Axios client + endpoints
│       ├── contexts/ # Auth, Theme, I18n
│       └── components/
├── desktop/          # PySide6 app (9 abas)
│   ├── tabs/         # Server, Chat, Metrics, Models, etc.
│   └── resources/    # QSS theme, icons
├── shared/           # SGlang args registry (84+ args, 9 presets)
└── scripts/          # Auto-dependency installer
```

## 🚀 Começando

### Requisitos

- Python 3.11+
- Node.js 18+ (apenas para build do frontend)
- SGLang (para controle de servidor)

### Instalação Rápida

```bash
# Clone e instale dependências
git clone https://github.com/seuusuario/sglang-commander.git
cd sglang-commander
pip install -r requirements.txt
python scripts/install_deps.py

# Build frontend (opcional — necessário apenas para modo web)
cd frontend && npm install && npm run build && cd ..

# Modo Desktop
python main.py

# Modo Servidor Web
python main.py --server --port 8080
```

Acesse o modo web em `http://localhost:8080` e complete o setup wizard na primeira execução.

### Docker

```bash
docker build -t sglang-commander .
docker run -p 8080:8080 -v sglang-data:/data sglang-commander
```

## 📖 API

Com o servidor rodando, a documentação interativa da API está disponível em:
- Swagger UI: `http://localhost:8080/docs`
- ReDoc: `http://localhost:8080/redoc`

### Endpoints Principais

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/server/status` | Status do servidor |
| `POST` | `/api/v1/server/start` | Iniciar servidor |
| `POST` | `/api/v1/server/stop` | Parar servidor |
| `GET` | `/api/v1/chat/completions` | Chat streaming (SSE) |
| `GET` | `/api/v1/metrics/latest` | Métricas em tempo real |
| `GET` | `/api/v1/models/search` | Buscar modelos HF |
| `GET` | `/api/v1/benchmark/run` | Executar benchmark |
| `GET` | `/api/v1/update/check` | Verificar atualizações |

## 🖥️ Desktop vs Web

O SGLang Commander opera em **dois modos**:

- **Desktop** (`python main.py`): Aplicação PySide6 nativa com 9 abas. Ideal para uso local.
- **Servidor Web** (`python main.py --server`): FastAPI servindo o React SPA. Acessível de qualquer dispositivo na rede.

Ambos compartilham o mesmo backend e banco de dados SQLite.

## 🛠️ Stack

- **Backend**: Python 3.13+, FastAPI, SQLAlchemy (async), SQLite, Pydantic, JWT (python-jose), bcrypt
- **Frontend**: React 19, TypeScript 5, Vite 8, Tailwind CSS 4, Recharts, Axios
- **Desktop**: PySide6, PyQtGraph, httpx, sounddevice
- **Infra**: Docker, ZeroTier, HuggingFace Hub, Prometheus

## 📄 Licença

MIT
