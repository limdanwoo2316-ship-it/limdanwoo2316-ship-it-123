import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Users, Network, Award, Volume2, ShieldAlert, RotateCcw, HelpCircle, ArrowRight, Sparkles, MessageSquare, Check, Home, DollarSign } from 'lucide-react';
import { CharacterType, CHARACTERS, GameMode, WSMessage, PlayerState } from './types';
import GameCanvas from './components/GameCanvas';
import GameHUD from './components/GameHUD';
import TemuWheel from './components/TemuWheel';
import CouponPopupRoom from './components/CouponPopupRoom';
import ChatPanel from './components/ChatPanel';

export default function App() {
  // Gameplay Screens
  // 'INTRO' | 'PREPARATION' | 'LOBBY' | 'PLAYING' | 'GAMEOVER'
  const [screen, setScreen] = useState<'INTRO' | 'PREPARATION' | 'LOBBY' | 'PLAYING' | 'GAMEOVER'>('INTRO');

  // Game Settings
  const [mode, setMode] = useState<GameMode>('SOLO');
  const [selectedCharP1, setSelectedCharP1] = useState<CharacterType>('buyer');
  const [selectedCharP2, setSelectedCharP2] = useState<CharacterType>('runner');
  
  const [player1Name, setPlayer1Name] = useState('기가바이어');
  const [player2Name, setPlayer2Name] = useState('특가런어웨이');

  // Online Multiplayer details
  const [roomCode, setRoomCode] = useState('');
  const [p2pAction, setP2pAction] = useState<'CREATE' | 'JOIN'>('CREATE');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [participants, setParticipants] = useState<{ id: string; name: string; charType: CharacterType; ready: boolean }[]>([]);
  const [localSocketId, setLocalSocketId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Active Game State pointers
  const [gameState, setGameState] = useState<{
    players: PlayerState[];
    timeRemaining: number;
    isFinished: boolean;
  }>({ players: [], timeRemaining: 60, isFinished: false });

  // Popups & Interactive items
  const [isWheelOpen, setIsWheelOpen] = useState(false);
  const [wheelCallback, setWheelCallback] = useState<((item: string, title: string, desc: string) => void) | null>(null);

  // Spasmodic Pop-up Bombs
  const [popupBomb, setPopupBomb] = useState<{ active: boolean; type: 'wheel' | 'survey' | 'deal' | 'click_bomb'; triggerCount: number }>({
    active: false,
    type: 'click_bomb',
    triggerCount: 0,
  });

  // Chat parameters
  const [chatMessages, setChatMessages] = useState<{ senderName: string; text: string; color: string }[]>([]);

  // Sound toggles
  const [muted, setMuted] = useState(false);

  // Result state
  const [resultData, setResultData] = useState<{
    winner: string;
    p1Score: number;
    p2Score: number;
    allPlayerScores?: { name: string; score: number; charType: CharacterType; isMe: boolean; isBot: boolean; isDead: boolean; isFinished: boolean }[];
  }>({ winner: '', p1Score: 0, p2Score: 0 });

  const isHost = mode !== 'ONLINE_P2P' || (participants.length > 0 && participants[0].id === localSocketId);

  // Handle network socket setup
  const connectToRoom = (code: string) => {
    if (!code.trim()) return;
    setErrorMessage('');

    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}`;
    
    try {
      const socket = new WebSocket(wsUrl);

      socket.addEventListener('open', () => {
        console.log('Connected to game server');
        // Join room trigger
        const joinMsg: WSMessage = {
          type: 'REQUEST_ROOM',
          payload: {
            name: player1Name || '무명 쇼퍼',
            charType: selectedCharP1,
            roomCode: code.toUpperCase(),
          },
        };
        socket.send(JSON.stringify(joinMsg));
      });

      socket.addEventListener('message', (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          
          switch (msg.type) {
            case 'ROOM_CREATED': {
              const codeAssigned = msg.payload.roomCode;
              setRoomCode(codeAssigned);
              setParticipants(msg.payload.participants);
              
              // Find self socket ID matching name
              const selfInLobby = msg.payload.participants.find((p) => p.name === player1Name);
              if (selfInLobby) {
                setLocalSocketId(selfInLobby.id);
              }
              setScreen('LOBBY');
              break;
            }

            case 'ROOM_UPDATE': {
              setParticipants(msg.payload.participants);
              if (msg.payload.isStarted) {
                setScreen('PLAYING');
              }
              break;
            }

            case 'ROOM_JOIN_ERROR': {
              setErrorMessage(msg.payload.message);
              socket.close();
              break;
            }

            case 'POPUP_BOMB': {
              // Trigger toxic popup bomb at target
              if (msg.payload.targetId === localSocketId) {
                setPopupBomb((prev) => ({
                  active: true,
                  type: msg.payload.popupType as any,
                  triggerCount: prev.triggerCount + 1,
                }));
                // play warning buzzer
                playClickSound();
              }
              break;
            }

            case 'CHAT_MSG': {
              setChatMessages((prev) => [...prev, msg.payload]);
              break;
            }
          }
        } catch (e) {
          console.error('Error handling event payload', e);
        }
      });

      socket.addEventListener('close', () => {
        console.log('Socket disconnected');
        setWs(null);
      });

      setWs(socket);
    } catch (err) {
      console.error('WebSocket connection failed:', err);
      setErrorMessage('서버 연결에 실패하였습니다. 오프라인 모드를 추천드립니다.');
    }
  };

  const handleSendMessage = (text: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const chatMsg: WSMessage = {
        type: 'CHAT_MSG',
        payload: {
          senderName: player1Name,
          text,
          color: CHARACTERS[selectedCharP1].color,
        },
      };
      ws.send(JSON.stringify(chatMsg));
    }
  };

  const startOnlineGame = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const startMsg: WSMessage = { type: 'HOST_START_GAME' };
      ws.send(JSON.stringify(startMsg));
    }
  };

  const leaveLobby = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
      ws.close();
      setWs(null);
    }
    setScreen('INTRO');
    setChatMessages([]);
  };

  const [copiedCode, setCopiedCode] = useState(false);

  const copyRoomCodeToClipboard = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Auto join / fill room from query string invitation link!
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && room.trim()) {
      const sanitizedRoom = room.trim().toUpperCase();
      setRoomCode(sanitizedRoom);
      setMode('ONLINE_P2P');
      setScreen('PREPARATION');
    }
  }, []);

  // Sound effects mock
  const playClickSound = () => {
    if (muted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  };

  const handleOpenWheel = (callback: (item: string, title: string, desc: string) => void) => {
    setWheelCallback(() => callback);
    setIsWheelOpen(true);
  };

  const handleSpinComplete = (item: string, title: string, desc: string) => {
    if (wheelCallback) {
      wheelCallback(item, title, desc);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-temu-orange text-brutal-black overflow-x-hidden font-sans relative border-[10px] md:border-[16px] border-brutal-black">
      
      {/* 1. Brutalist Status Bar / Header */}
      <header className="w-full bg-white border-b-6 border-brutal-black py-3 px-4 md:px-6 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-neon-yellow border-3 border-brutal-black rounded-full flex items-center justify-center font-extrabold shadow-[2px_2px_0px_rgba(0,0,0,1)] text-lg">
            🛒
          </div>
          <span className="font-display font-black text-lg md:text-xl tracking-tighter uppercase text-brutal-black">
            TEMU MARIO ROADRUNNER
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute toggle with brutal shadow */}
          <button
            type="button"
            id="sound-toggle-btn"
            onClick={() => setMuted(!muted)}
            className="p-2 bg-neon-yellow border-3 border-brutal-black hover:bg-white text-brutal-black font-black text-xs shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Volume2 className={`w-4 h-4 ${muted ? 'opacity-40 line-through' : ''}`} />
            <span className="hidden sm:inline font-mono tracking-tighter">
              {muted ? 'MUTED' : 'BOOMBOX'}
            </span>
          </button>
        </div>
      </header>

      {/* RENDER ACTIVE SCREENS */}
      <main className="flex-1 flex flex-col justify-center items-center p-4 md:p-8 relative">
        <AnimatePresence mode="wait">
          
          {/* 1. MAIN INTRO SCREEN */}
          {screen === 'INTRO' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-white border-6 border-brutal-black p-6 md:p-8 shadow-[8px_8px_0px_#1a1a1a] text-center relative flex flex-col items-center"
            >
              {/* Fake Warning Banner */}
              <div className="mb-4 px-4 py-1.5 bg-neon-yellow border-3 border-brutal-black text-xs font-black tracking-tight text-brutal-black flex items-center gap-1.5 shadow-[3px_3px_0px_#1a1a1a] animate-pulse">
                <ShieldAlert className="w-4 h-4 text-red-600 animate-bounce" /> 
                <span>SPEED RACE LIMIT: 99.9% SHOCK PRICE DISCOUNT!</span>
              </div>

              {/* Mega Title text */}
              <div className="mb-6 flex flex-col items-center">
                <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter uppercase text-brutal-black drop-shadow-[4px_4px_0px_#FF6321]">
                  테무 마리오
                </h1>
                <p className="font-mono text-xs font-extrabold tracking-widest text-[#555] bg-yellow-100 px-3 py-1 border-2 border-brutal-black mt-2 inline-block">
                  P2P SUPER DISCOUNT VOUCHER RUN
                </p>
              </div>

              {/* Instructions memo */}
              <div className="w-full bg-yellow-100/40 border-4 border-dashed border-brutal-black p-4 text-xs font-extrabold text-[#222] leading-relaxed mb-6 text-left">
                <span className="text-white font-black px-2 py-0.5 rounded bg-brutal-black border-2 border-brutal-black mr-2">
                  RULE
                </span> 
                장애물을 피해 끝까지 달리세요! 돈을 주워 특가를 선점하고, 쿠폰 블록을 때려 룰렛을 돌리세요! 룰렛을 돌리면 상대방에게 악질적인 마케팅 팝업 테러 공격을 퍼부어 화면을 마비시킬 수 있습니다!
              </div>

              {/* Modes Selection list */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-6">
                {[
                  {
                    id: 'SOLO' as GameMode,
                    title: '연습 모드 (SOLO)',
                    desc: '인공지능 특가 기획 알바생과 질주 대결',
                    icon: Play,
                    bg: 'bg-green-100 hover:bg-green-200',
                  },
                  {
                    id: 'LOCAL_VERSUS' as GameMode,
                    title: '우정파괴 2인용',
                    desc: '우정파괴! 한 키보드로 오프라인 화면 배틀',
                    icon: Users,
                    bg: 'bg-blue-100 hover:bg-blue-200',
                  },
                  {
                    id: 'ONLINE_P2P' as GameMode,
                    title: '실시간 P2P 게임',
                    desc: '대기실을 파서 다른 탭/컴퓨터와 연동 경쟁',
                    icon: Network,
                    bg: 'bg-yellow-100 hover:bg-yellow-200',
                  },
                ].map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    id={`mode-select-${card.id}`}
                    onClick={() => {
                      playClickSound();
                      setMode(card.id);
                      setScreen('PREPARATION');
                      if (card.id === 'ONLINE_P2P') {
                        // Generate a clean 4-digit room code
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                        let generated = '';
                        for (let i = 0; i < 4; i++) {
                          generated += chars.charAt(Math.floor(Math.random() * chars.length));
                        }
                        setRoomCode(generated);
                        setP2pAction('CREATE');
                      }
                    }}
                    className={`p-4 border-4 border-brutal-black flex flex-col items-center justify-between text-center transition-all cursor-pointer shadow-[4px_4px_0px_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#1a1a1a] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none ${card.bg}`}
                  >
                    <div className="p-2.5 bg-white border-3 border-brutal-black rounded-lg mb-2 text-brutal-black">
                      <card.icon className="w-5 h-5 text-brutal-black" />
                    </div>
                    <div className="flex flex-col flex-1 justify-center">
                      <h3 className="text-xs font-black text-brutal-black uppercase tracking-tighter mb-1.5 leading-none">
                        {card.title}
                      </h3>
                      <p className="text-[10px] text-[#444] leading-tight font-extrabold">
                        {card.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-zinc-500 font-bold border-t-2 border-dashed border-zinc-200 pt-3 w-full">
                * 本 게임은 이커머스 트렌드를 풍자하여 제작된 오락용 아케이드 웹앱입니다.
              </div>
            </motion.div>
          )}

          {/* 2. PREPARATION CHARACTER SELECT SCREEN */}
          {screen === 'PREPARATION' && (
            <motion.div
              key="preparation"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-4xl bg-white border-6 border-brutal-black p-6 shadow-[8px_8px_0px_#1a1a1a] flex flex-col"
            >
              <div className="text-center mb-6">
                <h2 className="font-display text-3xl font-black text-brutal-black uppercase tracking-tight">
                  🛒 쇼퍼 정보 등록 🛒
                </h2>
                <p className="text-xs font-bold text-zinc-500 bg-zinc-100 px-3 py-1 border-2 border-brutal-black inline-block mt-2">
                  닉네임을 등록하고 장바구니를 챙겨 레이스를 준비하세요!
                </p>
              </div>

              {/* Preparation Panels Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                
                {/* 1P buyer configuration Card */}
                <div className="p-5 bg-orange-100 border-4 border-brutal-black shadow-[4px_4px_0px_#1a1a1a] flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b-4 border-brutal-black pb-2">
                    <span className="text-xs font-black text-brutal-black uppercase">1P 바이어 설정</span>
                    <span className="text-[10px] bg-white border-2 border-brutal-black px-2 py-0.5 leading-none font-black text-brutal-black">
                      PLAYER 1
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1 justify-center">
                    <label className="text-[10px] font-black text-brutal-black uppercase tracking-tighter">
                      바이어 닉네임:
                    </label>
                    <input
                      type="text"
                      value={player1Name}
                      onChange={(e) => setPlayer1Name(e.target.value)}
                      className="p-3 bg-white border-4 border-brutal-black text-xs font-black outline-none text-brutal-black focus:bg-yellow-100"
                    />
                    <div className="mt-4 p-3.5 bg-white border-3 border-brutal-black rounded flex items-center gap-3">
                      <span className="text-3xl">🏁</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-brutal-black">속도 균등화 패치 진행됨 (Fair Play)</span>
                        <span className="text-[9px] text-zinc-500 font-bold leading-tight">모든 플레이어가 동일한 기본 스코어 빌드 및 속도를 가집니다.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2P setup Card */}
                <div className="p-5 bg-blue-100 border-4 border-brutal-black shadow-[4px_4px_0px_#1a1a1a] flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b-4 border-brutal-black pb-2">
                    <span className="text-xs font-black text-brutal-black uppercase">2P 상대방 설정</span>
                    <span className="text-[10px] bg-white border-2 border-brutal-black px-2 py-0.5 leading-none font-black text-brutal-black">
                      {mode === 'SOLO' ? 'AI BOT' : mode === 'LOCAL_VERSUS' ? 'LOCAL USERP2' : 'P2P REMOTE'}
                    </span>
                  </div>

                  {mode === 'ONLINE_P2P' ? (
                    <div className="flex-1 flex flex-col gap-4">
                      {/* Neo-brutalist Tab Buttons */}
                      <div className="grid grid-cols-2 border-3 border-brutal-black font-mono text-[10px] font-black bg-white shadow-[2px_2px_0px_#1a1a1a]">
                        <button
                          type="button"
                          onClick={() => {
                            playClickSound();
                            setP2pAction('CREATE');
                            // Regenerate a room code for hosting
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                            let generated = '';
                            for (let i = 0; i < 4; i++) {
                              generated += chars.charAt(Math.floor(Math.random() * chars.length));
                            }
                            setRoomCode(generated);
                          }}
                          className={`py-2 text-center transition-all cursor-pointer ${
                            p2pAction === 'CREATE'
                              ? 'bg-[#fb923c] text-white border-r-3 border-brutal-black'
                              : 'bg-white text-zinc-500 hover:text-brutal-black border-r-3 border-brutal-black'
                          }`}
                        >
                          👑 방 만들기 (HOST)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playClickSound();
                            setP2pAction('JOIN');
                            setRoomCode(''); // Clear so they can type
                          }}
                          className={`py-2 text-center transition-all cursor-pointer ${
                            p2pAction === 'JOIN'
                              ? 'bg-[#fb923c] text-white'
                              : 'bg-white text-zinc-500 hover:text-brutal-black'
                          }`}
                        >
                          🚪 방 참가하기 (JOIN)
                        </button>
                      </div>

                      {p2pAction === 'CREATE' ? (
                        <div className="flex-1 flex flex-col justify-center bg-[#fffbeb] p-3.5 border-3 border-brutal-black shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                          <span className="text-[9px] font-black text-[#f97316] uppercase block tracking-wider font-mono">
                            나만의 초대용 대기실 코드 (ROOM CODE)
                          </span>
                          <span className="text-3xl font-mono font-black tracking-widest text-[#1a1a1a] my-2 bg-white border-3 border-brutal-black py-2 text-center shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            {roomCode}
                          </span>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-[9px] text-[#444] font-extrabold leading-snug max-w-[190px]">
                              방 개설 후 친구들에게 이 4자리 코드를 불러주면 똑같이 참여할 수 있습니다!
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                playClickSound();
                                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                                let generated = '';
                                for (let i = 0; i < 4; i++) {
                                  generated += chars.charAt(Math.floor(Math.random() * chars.length));
                                }
                                setRoomCode(generated);
                              }}
                              className="text-[9px] font-black underline hover:text-[#f97316] ml-2"
                            >
                              [코드 재생성 🔄]
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center bg-white p-3.5 border-3 border-brutal-black shadow-[3px_3px_0px_rgba(0,0,0,1)] gap-2">
                          <label className="text-[9px] font-black text-brutal-black uppercase tracking-tight block">
                            방장이 만들어둔 4자리 대기실 코드 입력:
                          </label>
                          <input
                            type="text"
                            value={roomCode}
                            maxLength={4}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase().trim())}
                            placeholder="예: ABCD"
                            className="p-2.5 bg-zinc-50 border-3 border-brutal-black text-center font-mono text-2xl font-black outline-none tracking-widest text-brutal-black focus:bg-yellow-50 placeholder-zinc-400"
                          />
                        </div>
                      )}

                      {errorMessage && (
                        <div className="p-2 bg-red-100 border-2 border-red-600 text-red-700 text-[10px] font-black leading-snug">
                          ⚠️ ERROR: {errorMessage}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 flex-1 justify-center">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-brutal-black">
                          상대방 닉네임:
                        </label>
                        <input
                          type="text"
                          value={player2Name}
                          onChange={(e) => setPlayer2Name(e.target.value)}
                          disabled={mode === 'SOLO'}
                          className="p-3 bg-white border-4 border-brutal-black text-xs font-black outline-none text-brutal-black focus:bg-yellow-100 disabled:opacity-40"
                        />
                      </div>
                      <div className="p-3.5 bg-white border-3 border-brutal-black rounded flex items-center gap-3">
                        <span className="text-3xl">🤖</span>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-brutal-black">균형 잡인 대등한 경쟁</span>
                          <span className="text-[9px] text-zinc-500 font-bold leading-tight">직업별 격차가 완전히 배제되어 오직 피지컬로 결판납니다!</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Action Rows */}
              <div className="flex gap-4 w-full justify-between items-center border-t-4 border-brutal-black pt-4">
                <button
                  type="button"
                  id="prep-back-btn"
                  onClick={() => {
                    playClickSound();
                    setScreen('INTRO');
                  }}
                  className="brutal-btn bg-white hover:bg-zinc-150"
                >
                  뒤로가기
                </button>

                <button
                  type="button"
                  id="prep-confirm-btn"
                  onClick={() => {
                    playClickSound();
                    if (mode === 'ONLINE_P2P') {
                      if (p2pAction === 'JOIN' && !roomCode.trim()) {
                        setErrorMessage('입장할 대기실의 4자리 코드를 입력해주세요!');
                        return;
                      }
                      connectToRoom(roomCode.trim().toUpperCase() || 'TEMU');
                    } else {
                      setScreen('PLAYING');
                    }
                  }}
                  className="brutal-btn brutal-btn-yellow"
                >
                  {mode === 'ONLINE_P2P' 
                    ? (p2pAction === 'CREATE' ? '새로운 특가방 개설하기 (방장) 👑' : '대기실 코드로 입장하기 (참가) 🚪') 
                    : '장바구니 챙겨 달리기 시작! 🏁'}
                </button>
              </div>
            </motion.div>
          )}

          {/* 3. MULTIPLAYER LOBBY PANEL (ONLINE MODE ONLY) */}
          {screen === 'LOBBY' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-5xl flex flex-col md:flex-row gap-6 items-stretch"
            >
              {/* Left Column: Room info & connection state */}
              <div className="flex-1 p-6 bg-white border-6 border-brutal-black shadow-[8px_8px_0px_#1a1a1a] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b-4 border-brutal-black pb-4 mb-4">
                    <div>
                      <span className="text-[10px] font-black text-temu-orange uppercase tracking-wider block font-mono">
                        ONLINE DIRECT LOBBY
                      </span>
                      <h2 className="font-display text-2xl font-black text-brutal-black uppercase mt-0.5">
                        특가 대기실 라운지
                      </h2>
                    </div>
                    <div className="px-3.5 py-1.5 bg-neon-yellow border-3 border-brutal-black text-brutal-black font-black text-sm shadow-[3px_3px_0px_#1a1a1a] animate-pulse">
                      방코드: {roomCode}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <h3 className="text-xs font-black uppercase text-zinc-500 font-mono">
                      현재 참가 대기 중인 쇼퍼 ({participants.length}명 대기 중)
                    </h3>
                    
                    {participants.map((p, idx) => {
                      const isMe = p.id === localSocketId;
                      const isRoomHost = idx === 0;
                      return (
                        <div key={idx} className="p-3.5 bg-yellow-100/40 border-3 border-brutal-black shadow-[3px_3px_0px_#1a1a1a] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{CHARACTERS[p.charType].icon}</span>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-brutal-black truncate">
                                  {p.name}
                                </span>
                                {isRoomHost && (
                                  <span className="text-[8px] font-black bg-yellow-300 text-brutal-black border-2 border-brutal-black px-1.5 py-0.5 leading-none">
                                    👑 방장
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-[#555] font-black tracking-tighter">
                                {CHARACTERS[p.charType].koreanName}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="p-4 text-center border-4 border-dashed border-zinc-400 bg-zinc-50 text-zinc-650 text-xs font-black flex flex-col items-center justify-center gap-1.5 mt-4">
                      <p className="text-[10px] text-zinc-500 font-bold max-w-sm leading-normal font-sans">
                        친구에게 대기실 코드 <span className="underline font-black text-brutal-black bg-yellow-100 px-1 py-0.5 font-mono">{roomCode}</span>를 알려주세요! 친구들은 "정 정보 등록"의 "방 참가하기"에서 이 코드를 입력하여 입장할 수 있습니다.
                      </p>
                      
                      <button
                        type="button"
                        id="lobby-copy-code-btn"
                        onClick={() => {
                          playClickSound();
                          copyRoomCodeToClipboard();
                        }}
                        className="mt-1.5 w-full max-w-xs text-[10px] font-black uppercase bg-neon-yellow hover:bg-yellow-300 border-3 border-brutal-black text-brutal-black py-2.5 px-4 shadow-[3px_3px_0px_#1a1a1a] transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        📋 {copiedCode ? '대기실 코드 4자리가 복사되었습니다!' : '방 코드 복사하기'}
                      </button>
                    </div>
                  </div>
                  </div>

                {/* Match CTA buttons */}
                <div className="flex flex-col sm:flex-row gap-3 mt-6 border-t-4 border-brutal-black pt-4 w-full">
                  <button
                    type="button"
                    id="lobby-leave-btn"
                    onClick={leaveLobby}
                    className="brutal-btn bg-white hover:bg-zinc-100"
                  >
                    나가기 (참여포기)
                  </button>

                  {isHost ? (
                    <button
                      type="button"
                      id="lobby-start-btn"
                      onClick={() => {
                        playClickSound();
                        startOnlineGame();
                      }}
                      disabled={participants.length < 2}
                      className="flex-1 brutal-btn brutal-btn-yellow"
                    >
                      {participants.length < 2 
                        ? '참가 대기 중 (최소 2인 이상 필요) 🏁' 
                        : '기획 특별 승인 레이스 개시! 🏁'}
                    </button>
                  ) : (
                    <div className="flex-1 p-3 bg-zinc-100 border-4 border-dashed border-zinc-400 text-center text-xs font-black text-zinc-600 flex items-center justify-center gap-1">
                      <span className="animate-spin text-temu-orange">⚡</span>
                      <span>방장 ({participants[0]?.name || '...'})의 레이스 즉시 개시 승인을 대기하는 중...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Chat integration */}
              <div className="w-full md:w-80">
                <ChatPanel
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  senderName={player1Name}
                />
              </div>
            </motion.div>
          )}

          {/* 4. ACTIVE PLATFORMER GAMEPLAY VIEWPORT */}
          {screen === 'PLAYING' && (
            <motion.div
              key="gameplay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-2 relative w-full"
            >
              {/* Outer frame matching client grid */}
              <div className="w-full max-w-4xl h-[480px] sm:h-[510px] md:h-[540px] relative border-8 border-brutal-black shadow-[10px_10px_0px_#1a1a1a]">
                <GameCanvas
                  mode={mode}
                  characters={{ player1: selectedCharP1, player2: selectedCharP2 }}
                  playerNames={{ player1: player1Name, player2: player2Name }}
                  wsConnection={ws}
                  localPlayerId={localSocketId || 'local-1'}
                  roomParticipants={participants}
                  popupBombActive={popupBomb.active}
                  popupTriggerCount={popupBomb.triggerCount}
                  onOpenWheel={handleOpenWheel}
                  onGameOver={(winner, p1Score, p2Score, rankingList) => {
                    setResultData({ winner, p1Score, p2Score, allPlayerScores: rankingList });
                    setScreen('GAMEOVER');
                  }}
                  onStateChange={setGameState}
                />

                {/* Float absolute status overlay HUD */}
                <GameHUD
                  players={gameState.players}
                  timeRemaining={gameState.timeRemaining}
                  localPlayerId={localSocketId || 'local-1'}
                />
              </div>

              {/* In-Game spin wheel and malware blocks popup overlays */}
              <TemuWheel
                isOpen={isWheelOpen}
                onClose={() => {
                  setIsWheelOpen(false);
                  setWheelCallback(null);
                }}
                onSpinComplete={handleSpinComplete}
              />

              <CouponPopupRoom
                isOpen={popupBomb.active}
                type={popupBomb.type}
                onForceClose={() => {
                  setPopupBomb((prev) => ({ ...prev, active: false }));
                }}
              />
            </motion.div>
          )}

          {/* 5. GAMEOVER SUMMARY SCREENS */}
          {screen === 'GAMEOVER' && (
            <motion.div
              key="gameover"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl bg-white border-6 border-brutal-black p-6 md:p-8 shadow-[8px_8px_0px_#1a1a1a] text-center flex flex-col items-center"
            >
              {/* Crown stamp */}
              <div className="flex flex-col items-center mb-4">
                <div className="p-4 bg-neon-yellow border-4 border-brutal-black shadow-[3px_3px_0px_#1a1a1a] text-brutal-black mb-2 animate-bounce rounded-full">
                  <Award className="w-8 h-8" />
                </div>
                <span className="text-xs font-black text-rose-500 bg-red-50 border-2 border-brutal-black px-3 py-0.5 uppercase tracking-widest leading-none">
                  레이스 정산 보고서 완료
                </span>
              </div>

              <h1 className="font-display text-3xl md:text-4xl font-black text-brutal-black uppercase tracking-tight leading-none mb-4">
                💰 특가 득템 완주 결과 발표 💰
              </h1>
              
              {/* Massive winner announce card */}
              <div className="w-full bg-yellow-100/60 border-4 border-brutal-black p-6 shadow-[4px_4px_0px_#1a1a1a] mb-6 relative overflow-hidden text-center">
                <span className="text-[10px] text-zinc-650 font-black uppercase block tracking-wider mb-1 font-mono">
                  SAVINGS CHAMPION BUYER
                </span>
                <h2 className="text-2xl font-black text-brutal-black px-4 uppercase leading-none my-1 animate-pulse">
                  ✨ {resultData.winner} ✨
                </h2>

                <div className="border-t-4 border-dashed border-brutal-black mt-4 pt-4">
                  <h3 className="text-[10px] font-black uppercase text-zinc-500 mb-2.5 text-left font-mono">
                    최종 절약 득템 정산표 (LEADERBOARD)
                  </h3>

                  {resultData.allPlayerScores && resultData.allPlayerScores.length > 0 ? (
                    <div className="space-y-2 text-left">
                      {resultData.allPlayerScores.map((p, idx) => (
                        <div 
                          key={idx} 
                          className={`flex items-center justify-between p-2.5 border-3 border-brutal-black shadow-[2px_2px_0px_#1a1a1a] text-xs font-black ${
                            p.isMe 
                              ? 'bg-neon-yellow text-brutal-black' 
                              : p.isFinished 
                                ? 'bg-emerald-50 text-emerald-950' 
                                : 'bg-white text-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 text-center text-xs font-extrabold">
                              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                            </span>
                            <span className="text-lg">{CHARACTERS[p.charType]?.icon || '🛒'}</span>
                            <div className="flex flex-col min-w-0">
                              <span className="truncate max-w-[150px] font-black">
                                {p.name} {p.isMe && '(나)'}
                              </span>
                              <span className="text-[8px] text-zinc-500 font-bold">
                                {p.isFinished ? '🏁 완주완료' : p.isDead ? '💀 파산오버' : '🛒 쇼핑레이스 중'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-sm font-black text-red-650">
                              ${p.score.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-xs font-black text-brutal-black">
                      <div className="flex flex-col items-center border-r-4 border-dashed border-brutal-black p-1">
                        <span className="text-[9px] text-zinc-650 font-bold uppercase mb-1">
                          {player1Name} 획득액
                        </span>
                        <span className="text-xl font-black text-temu-orange">
                          ${resultData.p1Score.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col items-center p-1">
                        <span className="text-[9px] text-zinc-650 font-bold uppercase mb-1">
                          {mode === 'SOLO' ? 'AI BOT' : player2Name} 획득액
                        </span>
                        <span className="text-xl font-black text-blue-600">
                          ${resultData.p2Score.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex gap-4 w-full border-t-4 border-brutal-black pt-4">
                <button
                  type="button"
                  id="result-menu-btn"
                  onClick={() => {
                    playClickSound();
                    setScreen('INTRO');
                  }}
                  className="flex-1 brutal-btn bg-white hover:bg-zinc-100 flex justify-center items-center gap-2"
                >
                  <Home className="w-4 h-4 text-brutal-black" />
                  라운지로 이동 (메뉴)
                </button>

                <button
                  type="button"
                  id="result-replay-btn"
                  onClick={() => {
                    playClickSound();
                    setScreen('PLAYING');
                  }}
                  className="flex-1 brutal-btn brutal-btn-yellow flex justify-center items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4 text-brutal-black animate-spin-slow" />
                  즉시 재질주 대결! 🏁
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* 2. Brutalist Marquee Footer */}
      <footer className="w-full brutal-marquee select-none mt-auto pointer-events-none">
        <div className="brutal-marquee-content">
          &nbsp; • FREE SHIPPING ON ALL ORDERS OVER $0.00 • LIMITED TIME ONLY • COLLECT ALL EXTRA COUPON VOUCHERS • INVITE ALL FRIENDS FOR FREE ITEMS • FREE SHIPPING ON ALL ORDERS OVER $0.00 • LIMITED TIME ONLY • COLLECT ALL EXTRA COUPON VOUCHERS • INVITE ALL FRIENDS FOR FREE ITEMS •&nbsp;
        </div>
      </footer>
    </div>
  );
}
