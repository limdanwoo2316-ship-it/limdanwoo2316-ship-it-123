import express from 'express';
import path from 'path';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { WSMessage, CharacterType } from './src/types';

const app = express();
const PORT = 3000;
const server = createHttpServer(app);

// Simple API status
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', onlinePlayers: Array.from(sockets.keys()).length, activeRooms: Object.keys(rooms).length });
});

// Dictionary of connected clients and rooms
const sockets = new Map<WebSocket, { id: string; name: string; roomCode: string }>();
const rooms: Record<
  string,
  {
    roomCode: string;
    isStarted: boolean;
    participants: { id: string; name: string; charType: CharacterType; ready: boolean }[];
  }
> = {};

// Helper to send typed messages
function sendTo(ws: WebSocket, msg: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// Broadcaster for rooms
function broadcastToRoom(roomCode: string, msg: WSMessage, excludeWs?: WebSocket) {
  const room = rooms[roomCode];
  if (!room) return;

  for (const [ws, info] of sockets.entries()) {
    if (info.roomCode === roomCode) {
      if (excludeWs && ws === excludeWs) continue;
      sendTo(ws, msg);
    }
  }
}

// Setup WebSocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to Temu Mario P2P Gateway');
  sockets.set(ws, { id: Math.random().toString(36).substring(2, 9), name: '아무개', roomCode: '' });

  ws.on('message', (messageBuffer) => {
    try {
      const message: any = JSON.parse(messageBuffer.toString());
      const clientInfo = sockets.get(ws);
      if (!clientInfo) return;

      switch (message.type) {
        case 'REQUEST_ROOM': {
          const { name, charType, roomCode: rawCode } = message.payload;
          const roomCode = rawCode.trim().toUpperCase() || 'TEMU';
          clientInfo.name = name;
          clientInfo.roomCode = roomCode;

          // Join or create room
          if (!rooms[roomCode]) {
            rooms[roomCode] = {
              roomCode,
              isStarted: false,
              participants: [],
            };
            console.log(`Lobby Created: ${roomCode}`);
          }

          const room = rooms[roomCode];
          if (room.isStarted) {
            sendTo(ws, { type: 'ROOM_JOIN_ERROR', payload: { message: '이미 게임이 진행 중방입니다.' } });
            clientInfo.roomCode = '';
            return;
          }

          // Check if user already joined
          const exists = room.participants.find((p) => p.id === clientInfo.id);
          if (!exists) {
            room.participants.push({
              id: clientInfo.id,
              name,
              charType,
              ready: false,
            });
          }

          console.log(`User ${name} [${clientInfo.id}] joined Room ${roomCode}`);
          sendTo(ws, { type: 'ROOM_CREATED', payload: { roomCode, participants: room.participants } });
          broadcastToRoom(roomCode, {
            type: 'ROOM_UPDATE',
            payload: { roomCode, participants: room.participants, isStarted: room.isStarted },
          });

          // System message in chat
          broadcastToRoom(roomCode, {
            type: 'CHAT_MSG',
            payload: {
              senderName: '쇼핑 봇',
              text: `🧡 ${name}님이 쇼핑 카트를 끌고 입장하셨습니다! 🧡`,
              color: '#ff6600',
            },
          });
          break;
        }

        case 'LEAVE_ROOM': {
          const code = clientInfo.roomCode;
          if (code && rooms[code]) {
            rooms[code].participants = rooms[code].participants.filter((p) => p.id !== clientInfo.id);
            if (rooms[code].participants.length === 0) {
              delete rooms[code];
              console.log(`Lobby Destroyed: ${code}`);
            } else {
              broadcastToRoom(code, {
                type: 'ROOM_UPDATE',
                payload: { roomCode: code, participants: rooms[code].participants, isStarted: rooms[code].isStarted },
              });
              broadcastToRoom(code, {
                type: 'CHAT_MSG',
                payload: {
                  senderName: '쇼핑 봇',
                  text: `💨 ${clientInfo.name}님이 특가 상품을 포기하고 퇴장하셨습니다!`,
                  color: '#9ca3af',
                },
              });
            }
          }
          clientInfo.roomCode = '';
          break;
        }

        case 'HOST_START_GAME': {
          const code = clientInfo.roomCode;
          if (code && rooms[code]) {
            rooms[code].isStarted = true;
            broadcastToRoom(code, {
              type: 'ROOM_UPDATE',
              payload: { roomCode: code, participants: rooms[code].participants, isStarted: true },
            });
            broadcastToRoom(code, {
              type: 'CHAT_MSG',
              payload: {
                senderName: '번개 임원',
                text: `⚡⚡ 99.9% 마감 임박 특가 레이스가 시작되었습니다! 달려가세요! ⚡⚡`,
                color: '#ef4444',
              },
            });
          }
          break;
        }

        case 'SYNC_GAME_STATE': {
          // Relays player sync data to everyone else in the room
          const code = clientInfo.roomCode;
          if (code) {
            // Include source client id key so it's transparent
            const updatedPlayer = { ...message.payload.player, id: clientInfo.id };
            broadcastToRoom(
              code,
              {
                type: 'SYNC_GAME_STATE',
                payload: {
                  player: updatedPlayer,
                  blockHitId: message.payload.blockHitId,
                  coinGrabId: message.payload.coinGrabId,
                  enemyKillId: message.payload.enemyKillId,
                  playerDie: message.payload.playerDie,
                },
              },
              ws // Exclude sender to save bandwith
            );
          }
          break;
        }

        case 'TRIGGER_WHEEL': {
          const code = clientInfo.roomCode;
          if (code) {
            // Spin outcomes (Temu theme!)
            const rewards = [
              { item: 'speed_shoes', title: '99% 전동 슈즈', desc: '이동속도 2배 부스터! (단, 중국발 불꽃 스파크 조심)' },
              { item: 'giant_foam', title: '빅사이즈 스펀지 킹', desc: '거대화! 벽돌 블록을 그냥 밟아 허물 수 있습니다.' },
              { item: 'lightning_shield', title: '무한 무료배송 쉴드', desc: '위험 요소(공휴 배송비)를 1회 막아주는 아우라 배리어!' },
              { item: 'popup_attack', title: '악질 50달러 쿠폰 팝업', desc: '상대방 화면에 대문짝만한 할인 팝업 광고를 퍼붓습니다!' },
              { item: 'coupon_rain', title: '대박 할인쿠폰 소나기', desc: '쿠폰 카운를 +10 올려줍니다! 완전 노다지!' },
            ];
            const randomIndex = Math.floor(Math.random() * rewards.length);
            const reward = rewards[randomIndex];

            broadcastToRoom(code, {
              type: 'SPIN_WHEEL_RESULT',
              payload: {
                playerId: clientInfo.id,
                item: reward.item,
                title: reward.title,
                desc: reward.desc,
              },
            });

            broadcastToRoom(code, {
              type: 'CHAT_MSG',
              payload: {
                senderName: '룰렛 딜러',
                text: `🎁 ${clientInfo.name}님이 룰렛을 돌려 [${reward.title}] 당첨!`,
                color: '#f97316',
              },
            });

            // If it's a popup_attack, target the opponent
            if (reward.item === 'popup_attack') {
              const otherParticipants = rooms[code].participants.filter((p) => p.id !== clientInfo.id);
              if (otherParticipants.length > 0) {
                const target = otherParticipants[Math.floor(Math.random() * otherParticipants.length)];
                broadcastToRoom(code, {
                  type: 'POPUP_BOMB',
                  payload: {
                    targetId: target.id,
                    popupType: ['wheel', 'survey', 'deal'][Math.floor(Math.random() * 3)],
                  },
                });
              }
            }
          }
          break;
        }

        case 'CHAT_MSG': {
          const code = clientInfo.roomCode;
          if (code) {
            broadcastToRoom(code, {
              type: 'CHAT_MSG',
              payload: {
                senderName: clientInfo.name,
                text: message.payload.text,
                color: message.payload.color || '#fb923c',
              },
            });
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    const clientInfo = sockets.get(ws);
    if (clientInfo) {
      const code = clientInfo.roomCode;
      if (code && rooms[code]) {
        rooms[code].participants = rooms[code].participants.filter((p) => p.id !== clientInfo.id);
        if (rooms[code].participants.length === 0) {
          delete rooms[code];
          console.log(`Lobby Destroyed (Disconnect): ${code}`);
        } else {
          broadcastToRoom(code, {
            type: 'ROOM_UPDATE',
            payload: { roomCode: code, participants: rooms[code].participants, isStarted: rooms[code].isStarted },
          });
          broadcastToRoom(code, {
            type: 'CHAT_MSG',
            payload: {
              senderName: '쇼핑 봇',
              text: `🥀 ${clientInfo.name}님과 연결이 끊겨 특가 레이스에서 탈락하셨습니다.`,
              color: '#ef4444',
            },
          });
        }
      }
      sockets.delete(ws);
    }
    console.log('Client disconnected');
  });
});

// Upgrade handling to hook into Express HttpServer
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Setup Vite Dev server or production static assets serving
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted (Development Mode)');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production build from:', distPath);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Temu Mario full-stack backend running at http://0.0.0.0:${PORT}`);
  });
}

initServer().catch((e) => {
  console.error('Failed to start server:', e);
});
export default server;
