import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://bingo-vkkl.onrender.com", "https://*.onrender.com"]
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Armazenamento em memória das salas (em produção, usar Redis ou banco de dados)
const rooms = new Map();
const users = new Map(); // socketId -> { userId, roomId, isHost }

// Função para gerar cartela de bingo organizada por colunas (padrão tradicional)
function generateBingoCard(numbersPerCard) {
  const numbersPerRow = 5; // B, I, N, G, O
  
  // Ranges tradicionais do bingo
  const columnRanges = [
    { min: 1, max: 15 },   // B: 1-15
    { min: 16, max: 30 },  // I: 16-30
    { min: 31, max: 45 },  // N: 31-45
    { min: 46, max: 60 },  // G: 46-60
    { min: 61, max: 75 }   // O: 61-75
  ];
  
  // Calcular quantos números por coluna
  // Para 24 números: cada coluna tem 5 espaços, mas a coluna N tem coringa
  // Então: B=5, I=5, N=4+coringa, G=5, O=5
  const centerCol = 2; // Coluna N
  const numbersPerColumn = Math.floor(numbersPerCard / numbersPerRow);
  const remainder = numbersPerCard % numbersPerRow;
  
  // Calcular distribuição: remainder colunas terão +1 número
  // Mas a coluna N sempre tem numbersPerColumn números (tem coringa)
  const targetCounts = [];
  let totalTarget = 0;
  
  for (let col = 0; col < numbersPerRow; col++) {
    if (col === centerCol) {
      // Coluna N: sempre tem numbersPerColumn números (coringa ocupa 1 espaço)
      targetCounts[col] = numbersPerColumn;
    } else {
      // Outras colunas: distribuir remainder números extras
      // Contar quantas colunas antes desta (excluindo N) receberam extra
      let colsBeforeWithExtra = 0;
      for (let i = 0; i < col; i++) {
        if (i !== centerCol && i < remainder) {
          colsBeforeWithExtra++;
        }
      }
      // Se ainda há extras para distribuir (considerando que N não recebe)
      const adjustedRemainder = remainder;
      const positionInNonCenter = col < centerCol ? col : col - 1;
      targetCounts[col] = positionInNonCenter < adjustedRemainder 
        ? numbersPerColumn + 1 
        : numbersPerColumn;
    }
    totalTarget += targetCounts[col];
  }
  
  // Ajustar se o total não bater (garantir que a última coluna receba o que falta)
  if (totalTarget !== numbersPerCard) {
    const diff = numbersPerCard - totalTarget;
    targetCounts[numbersPerRow - 1] += diff;
  }
  
  // Gerar números para cada coluna
  const columnNumbers = [];
  
  for (let col = 0; col < numbersPerRow; col++) {
    const range = columnRanges[col];
    const count = targetCounts[col];
    const numbers = [];
    const used = new Set();
    
    // Gerar números aleatórios dentro do range da coluna
    while (numbers.length < count) {
      const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      if (!used.has(num)) {
        used.add(num);
        numbers.push(num);
      }
    }
    
    // Ordenar números dentro da coluna
    numbers.sort((a, b) => a - b);
    columnNumbers.push(numbers);
  }
  
  // Coletar todos os números para o array simples (compatibilidade)
  const allNumbers = [];
  columnNumbers.forEach(col => {
    allNumbers.push(...col);
  });
  allNumbers.sort((a, b) => a - b);
  
  // Calcular quantas linhas precisamos (considerando espaço do coringa)
  // Para 24 números + 1 coringa = 25 espaços, precisamos de 5 linhas (5x5)
  const totalSpaces = numbersPerCard + 1; // +1 para o coringa
  const numbersPerCol = Math.ceil(totalSpaces / numbersPerRow);
  const centerRow = Math.floor(numbersPerCol / 2);
  // centerCol já foi declarado acima
  
  // Criar grid organizado por COLUNA
  // O CSS grid preenche linha por linha, então organizamos o array
  // de forma que quando preenchido linha por linha, os números apareçam ordenados por coluna
  const grid = [];
  
  // Criar uma matriz 2D: matrix[col][row]
  const matrix = [];
  for (let col = 0; col < numbersPerRow; col++) {
    matrix[col] = [];
    let numberIndex = 0; // Índice para pegar números da coluna
    
    for (let row = 0; row < numbersPerCol; row++) {
      // Se for posição central (coluna N, linha do meio), deixar null (coringa)
      if (row === centerRow && col === centerCol) {
        matrix[col][row] = null; // Coringa
      } else {
        // Pegar próximo número da coluna (ordenado)
        if (numberIndex < columnNumbers[col].length) {
          matrix[col][row] = columnNumbers[col][numberIndex];
          numberIndex++;
        } else {
          matrix[col][row] = null;
        }
      }
    }
  }
  
  // Converter matriz para array linear (linha por linha para o CSS grid)
  // CSS grid preenche: linha 0 (B, I, N, G, O), linha 1 (B, I, N, G, O), etc.
  for (let row = 0; row < numbersPerCol; row++) {
    for (let col = 0; col < numbersPerRow; col++) {
      grid.push(matrix[col][row]);
    }
  }
  
  // Retornar tanto o array de números (para compatibilidade) quanto o grid
  return {
    numbers: allNumbers, // Array simples de números (para compatibilidade)
    grid: grid, // Grid organizado por colunas com coringa centralizado
    numbersPerRow,
    numbersPerCol,
    centerRow,
    centerCol
  };
}

// API REST

// Criar sala
app.post('/api/rooms', (req, res) => {
  const { hostName, numbersPerCard = 24 } = req.body;
  
  if (!hostName) {
    return res.status(400).json({ error: 'Nome do host é obrigatório' });
  }
  
  const roomId = uuidv4().substring(0, 8);
  const room = {
    id: roomId,
    hostName,
    numbersPerCard,
    drawnNumbers: [],
    participants: {},
    createdAt: Date.now(),
  };
  
  rooms.set(roomId, room);
  
  res.json({ roomId, room });
});

// Obter sala
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Sala não encontrada' });
  }
  
  res.json(room);
});

// Entrar na sala (via REST - para obter dados iniciais)
app.post('/api/rooms/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const { participantName } = req.body;
  
  if (!participantName) {
    return res.status(400).json({ error: 'Nome do participante é obrigatório' });
  }
  
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Sala não encontrada' });
  }
  
  const userId = uuidv4();
  const cardData = generateBingoCard(room.numbersPerCard);
  
  room.participants[userId] = {
    id: userId,
    name: participantName,
    card: cardData.numbers, // Array simples para compatibilidade
    cardGrid: cardData.grid, // Grid organizado por colunas
    numbersPerRow: cardData.numbersPerRow,
    numbersPerCol: cardData.numbersPerCol,
    centerRow: cardData.centerRow,
    centerCol: cardData.centerCol,
    markedNumbers: [],
    joinedAt: Date.now(),
  };
  
  rooms.set(roomId, room);
  
  // Notificar todos na sala via WebSocket
  io.to(roomId).emit('participantJoined', {
    participant: room.participants[userId],
    participantCount: Object.keys(room.participants).length
  });
  
  res.json({
    userId,
    room,
    participant: room.participants[userId]
  });
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Entrar na sala como host
  socket.on('joinAsHost', ({ roomId, userId }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    socket.join(roomId);
    users.set(socket.id, { userId, roomId, isHost: true });
    
    socket.emit('roomJoined', { room, isHost: true });
    console.log(`Host ${userId} entrou na sala ${roomId}`);
  });
  
  // Entrar na sala como participante
  socket.on('joinAsParticipant', ({ roomId, userId }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    if (!room.participants[userId]) {
      socket.emit('error', { message: 'Participante não encontrado na sala' });
      return;
    }
    
    socket.join(roomId);
    users.set(socket.id, { userId, roomId, isHost: false });
    
    socket.emit('roomJoined', { 
      room, 
      isHost: false,
      participant: room.participants[userId]
    });
    
    console.log(`Participante ${userId} entrou na sala ${roomId}`);
  });
  
  // Sortear número (apenas host)
  socket.on('drawNumber', ({ roomId }) => {
    const userInfo = users.get(socket.id);
    
    if (!userInfo || !userInfo.isHost) {
      socket.emit('error', { message: 'Apenas o host pode sortear números' });
      return;
    }
    
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    const maxNumber = 75;
    if (room.drawnNumbers.length >= maxNumber) {
      socket.emit('error', { message: 'Todos os números já foram sorteados' });
      return;
    }
    
    let number;
    do {
      number = Math.floor(Math.random() * maxNumber) + 1;
    } while (room.drawnNumbers.includes(number));
    
    room.drawnNumbers.push(number);
    room.drawnNumbers.sort((a, b) => a - b);
    room.lastDrawnAt = Date.now();
    
    rooms.set(roomId, room);
    
    // Notificar todos na sala
    io.to(roomId).emit('numberDrawn', {
      number,
      drawnNumbers: room.drawnNumbers,
      totalDrawn: room.drawnNumbers.length
    });
    
    console.log(`Número ${number} sorteado na sala ${roomId}`);
  });
  
  // Marcar número na cartela
  socket.on('markNumber', ({ roomId, userId, number }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    const participant = room.participants[userId];
    
    if (!participant) {
      socket.emit('error', { message: 'Participante não encontrado' });
      return;
    }
    
    // Verificar se o número está na cartela
    if (!participant.card.includes(number)) {
      socket.emit('error', { message: 'Número não está na sua cartela' });
      return;
    }
    
    // Toggle: se já está marcado, desmarcar; senão, marcar
    const index = participant.markedNumbers.indexOf(number);
    if (index > -1) {
      // Desmarcar
      participant.markedNumbers.splice(index, 1);
    } else {
      // Marcar
      participant.markedNumbers.push(number);
    }
    
    rooms.set(roomId, room);
    
    const hasBingo = participant.markedNumbers.length === participant.card.length;
    
    // Notificar o participante
    socket.emit('numberMarked', {
      number,
      markedNumbers: participant.markedNumbers,
      hasBingo
    });
    
    // Se ganhou, notificar todos (especialmente o host)
    if (hasBingo) {
      io.to(roomId).emit('bingo', {
        participantId: userId,
        participantName: participant.name
      });
      console.log(`🎉 BINGO! ${participant.name} completou a cartela na sala ${roomId}`);
    }
  });
  
  // Reiniciar sorteio (apenas host)
  socket.on('resetDraw', ({ roomId }) => {
    const userInfo = users.get(socket.id);
    
    if (!userInfo || !userInfo.isHost) {
      socket.emit('error', { message: 'Apenas o host pode reiniciar o sorteio' });
      return;
    }
    
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    room.drawnNumbers = [];
    room.lastDrawnAt = null;
    
    // Limpar marcações de todos os participantes
    Object.keys(room.participants).forEach(userId => {
      room.participants[userId].markedNumbers = [];
    });
    
    rooms.set(roomId, room);
    
    // Notificar todos na sala
    io.to(roomId).emit('drawReset', { room });
    
    console.log(`Sorteio reiniciado na sala ${roomId}`);
  });
  
  // Obter estado atual da sala
  socket.on('getRoomState', ({ roomId }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    const userInfo = users.get(socket.id);
    const response = {
      room,
      isHost: userInfo ? userInfo.isHost : false
    };
    
    if (userInfo && !userInfo.isHost && room.participants[userInfo.userId]) {
      response.participant = room.participants[userInfo.userId];
    }
    
    socket.emit('roomState', response);
  });
  
  // Desconexão
  socket.on('disconnect', () => {
    const userInfo = users.get(socket.id);
    
    if (userInfo) {
      console.log(`Cliente ${socket.id} desconectado da sala ${userInfo.roomId}`);
      users.delete(socket.id);
    }
  });
});

// Servir frontend buildado (agora dentro da pasta backend)
app.use(express.static(join(__dirname, 'dist')));

// Todas as rotas não-API redirecionam para o index.html (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  res.sendFile(join(__dirname, 'dist/index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Produção: https://bingo-vkkl.onrender.com`);
});

