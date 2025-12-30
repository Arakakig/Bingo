# Deploy no Render

Este projeto está configurado para rodar no Render: **https://bingo-vkkl.onrender.com/**

## ✅ Configuração Automática

O código detecta automaticamente o ambiente:

- **Produção (Render)**: Usa automaticamente `https://bingo-vkkl.onrender.com`
- **Desenvolvimento**: Usa `http://localhost:3000`

A detecção é feita automaticamente baseada no `window.location.hostname`.

## 📦 Estrutura para Deploy

O projeto está pronto para deploy:

```
backend/
├── dist/              # Frontend buildado (já incluído)
│   ├── assets/        # Arquivos JS/CSS
│   └── index.html     # Página principal
├── server.js          # Servidor principal
├── package.json       # Dependências
└── render.yaml        # Configuração do Render
```

## 🚀 Deploy no Render

1. **Conecte seu repositório** no Render
2. **Configure o serviço**:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`

3. **Variáveis de Ambiente** (opcional):
   - `NODE_ENV=production`
   - `PORT` (Render define automaticamente)

## 🔨 Rebuild do Frontend

Se precisar atualizar o frontend:

**Windows:**
```bash
build-and-copy.bat
```

**Manual:**
```bash
cd bingo-react
npm run build
# Copiar conteúdo de bingo-react/dist para backend/dist
```

## 📝 Notas Importantes

- ✅ O frontend está buildado dentro de `backend/dist/`
- ✅ O servidor serve automaticamente o frontend na raiz
- ✅ WebSocket funciona automaticamente na mesma URL do Render
- ✅ CORS está configurado para aceitar todas as origens
- ✅ A URL da API é detectada automaticamente (não precisa configurar)

## 🌐 URLs

- **Produção**: https://bingo-vkkl.onrender.com/
- **API**: https://bingo-vkkl.onrender.com/api/
- **WebSocket**: wss://bingo-vkkl.onrender.com (automático)
