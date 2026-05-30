import { useEffect, useRef, useState } from 'react';
import { GameWorld, PlayerState, BlockState, EnemyState, CoinState, ItemParticle, CharacterType, WSMessage } from '../types';
import { createInitialWorld, updateBotAI } from '../utils/level';

interface GameCanvasProps {
  mode: 'SOLO' | 'LOCAL_VERSUS' | 'ONLINE_P2P';
  characters: {
    player1: CharacterType;
    player2: CharacterType;
  };
  playerNames: {
    player1: string;
    player2: string;
  };
  wsConnection?: WebSocket | null;
  localPlayerId: string; // socket id, or 'local-1'
  roomParticipants?: { id: string; name: string; charType: CharacterType }[];
  onGameOver: (
    winnerName: string, 
    p1Score: number, 
    p2Score: number, 
    allPlayers?: { name: string; score: number; charType: CharacterType; isMe: boolean; isBot: boolean; isDead: boolean; isFinished: boolean }[]
  ) => void;
  onOpenWheel: (completedCallback: (item: string, title: string, desc: string) => void) => void;
  popupBombActive: boolean;
  popupTriggerCount: number;
  onStateChange?: (state: { players: PlayerState[]; timeRemaining: number; isFinished: boolean }) => void;
}

export default function GameCanvas({
  mode,
  characters,
  playerNames,
  wsConnection,
  localPlayerId,
  roomParticipants = [],
  onGameOver,
  onOpenWheel,
  popupBombActive,
  popupTriggerCount,
  onStateChange,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Synchronized state refs for game loop to avoid React re-render lag
  const worldRef = useRef<GameWorld>(createInitialWorld());
  const keysRef = useRef<Record<string, boolean>>({});
  const lastTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number>(0);

  // Countdown state before game starts
  const [startCountdown, setStartCountdown] = useState<number | null>(3);
  const frameCountRef = useRef<number>(0);

  // Safe ref for state changes to avoid tearing down loop
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Track the room participants in a ref to keep loop synchronized
  const participantsRef = useRef(roomParticipants);
  useEffect(() => {
    participantsRef.current = roomParticipants;
  }, [roomParticipants]);

  // Dimension states
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scoreFlash, setScoreFlash] = useState<string | null>(null);

  // Set up resize observer to keep canvas perfectly scaled
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      
      // Keep ratio close to 800x600 coordinates
      setDimensions({
        width: Math.max(width, 400),
        height: Math.min(height, 650),
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync state initialization
  useEffect(() => {
    const world = createInitialWorld();

    // 1. Initialize local players based on selected modes
    const p1Char = characters.player1;
    const p1Name = playerNames.player1 || 'Giga Buyer';

    if (mode === 'SOLO') {
      // Add P1 (User)
      world.players.push(createPlayer(localPlayerId, p1Name, p1Char, 100));
      // Add Bot
      world.players.push(createPlayer('bot', '테무 특가 AI 알바생', characters.player2 || 'runner', 200));
    } else if (mode === 'LOCAL_VERSUS') {
      // Add P1 (WASD)
      world.players.push(createPlayer('local-1', p1Name, p1Char, 100));
      // Add P2 (Arrows)
      world.players.push(createPlayer('local-2', playerNames.player2 || 'Discount Match', characters.player2, 200));
    } else if (mode === 'ONLINE_P2P') {
      // Add P1 (self)
      world.players.push(createPlayer(localPlayerId, p1Name, p1Char, 100));

      // Add other players from lobby participants
      participantsRef.current.forEach((part, idx) => {
        if (part.id !== localPlayerId) {
          world.players.push(createPlayer(part.id, part.name, part.charType, 100 + (idx + 1) * 60));
        }
      });
    }

    world.isStarted = false;
    worldRef.current = world;

    // Reset keyboard states
    keysRef.current = {};
  }, []);

  // Handle incoming websocket updates for P2P state sharing
  useEffect(() => {
    if (!wsConnection || mode !== 'ONLINE_P2P') return;

    const handleSocketMessage = (event: MessageEvent) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        const world = worldRef.current;

        if (data.type === 'SYNC_GAME_STATE') {
          const remotePlayer = data.payload.player;
          const existing = world.players.find((p) => p.id === remotePlayer.id);

          if (existing) {
            // Update remote player details smoothly using lerp or overwrite
            existing.x = remotePlayer.x;
            existing.y = remotePlayer.y;
            existing.vx = remotePlayer.vx;
            existing.vy = remotePlayer.vy;
            existing.score = remotePlayer.score;
            existing.couponCount = remotePlayer.couponCount;
            existing.lives = remotePlayer.lives;
            existing.isDead = remotePlayer.isDead;
            existing.isFinished = remotePlayer.isFinished;
            existing.powerup = remotePlayer.powerup;
            existing.facingLeft = remotePlayer.facingLeft;
          } else {
            // Spawn remote player if not already existing
            world.players.push(remotePlayer);
          }

          // Handle discrete block/coin/enemy hits synchronizing from peer
          if (data.payload.blockHitId) {
            const block = world.blocks.find((b) => b.id === data.payload.blockHitId);
            if (block && !block.isHit) {
              block.isHit = true;
              if (block.type === 'temu_box') {
                const reward = block.containsItem;
                if (reward && reward !== 'coin') {
                  const mushType = (reward === 'giant_foam' || reward === 'mini_foam') ? 'growth' : 'speed';
                  spawnMushroom(world, block.x, block.y, mushType);
                }
              }
            }
          }

          if (data.payload.coinGrabId) {
            const coin = world.coins.find((c) => c.id === data.payload.coinGrabId);
            if (coin && !coin.isCollected) {
              coin.isCollected = true;
              spawnItemParticle(world, coin.x, coin.y, '🎟️ 경쟁자 선점!', '#ee431e');
            }
          }

          if (data.payload.enemyKillId) {
            const enemy = world.enemies.find((e) => e.id === data.payload.enemyKillId);
            if (enemy && !enemy.isDead) {
              enemy.isDead = true;
              spawnItemParticle(world, enemy.x, enemy.y, '🔨 밟기 성공!', '#10b981');
            }
          }
        } else if (data.type === 'ROOM_UPDATE') {
          // Sync participants matching
          const currentParts = data.payload.participants;
          // Purge player state duplicates
          world.players = world.players.filter(
            (p) => p.id === localPlayerId || currentParts.some((cp) => cp.id === p.id)
          );
          currentParts.forEach((cp) => {
            if (cp.id !== localPlayerId && !world.players.some((p) => p.id === cp.id)) {
              world.players.push(createPlayer(cp.id, cp.name, cp.charType, 100 + Math.random() * 100));
            }
          });
        } else if (data.type === 'SPIN_WHEEL_RESULT') {
          const { playerId, item, title } = data.payload;
          const user = world.players.find((p) => p.id === playerId);
          if (user) {
            applyPowerupToPlayer(world, user, item as any);
            spawnItemParticle(world, user.x, user.y - 30, `🎁 ${title}!`, '#fb923c');
          }
        }
      } catch (err) {
        console.error('Socket error in GameCanvas:', err);
      }
    };

    wsConnection.addEventListener('message', handleSocketMessage);
    return () => wsConnection.removeEventListener('message', handleSocketMessage);
  }, [wsConnection, mode, localPlayerId]);

  function createPlayer(id: string, name: string, charType: CharacterType, spawnX: number): PlayerState {
    return {
      id,
      name,
      charType,
      x: spawnX,
      y: 100,
      vx: 0,
      vy: 0,
      width: 32,
      height: 44,
      isGrounded: false,
      score: 0,
      lives: 3,
      couponCount: 0,
      isDead: false,
      isFinished: false,
      facingLeft: false,
      hasShield: false,
    };
  }

  function getPlayerSize(player: PlayerState) {
    let w = player.width;
    let h = player.height;
    if (player.powerup?.visualActive) {
      if (player.powerup.type === 'giant_foam') {
        w += 24;
        h += 24;
      } else if (player.powerup.type === 'mini_foam') {
        w = 16;
        h = 22;
      }
    }
    return { w, h };
  }

  // Keyboard state setup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      keysRef.current[e.code] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Play countdown sound effect
  const playCountdownSound = (type: 'tick' | 'start') => {
    try {
      const gAudio = window.AudioContext || (window as any).webkitAudioContext;
      if (!gAudio) return;
      const ctx = new gAudio();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'tick') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // High C
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else {
        // Sweeping arcade sound for start
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.35); // C5
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {}
  };

  // Synchronous countdown timer logic (3, 2, 1, START)
  useEffect(() => {
    setStartCountdown(3);
    playCountdownSound('tick'); // Play sound for initial 3!

    const interval = setInterval(() => {
      setStartCountdown((prev) => {
        if (prev === null) return null;
        if (prev === 1) {
          // Time to START!
          const world = worldRef.current;
          if (world) {
            world.isStarted = true;
          }
          playCountdownSound('start');
          // Propagate initial state immediately
          if (onStateChangeRef.current && world) {
            onStateChangeRef.current({
              players: [...world.players],
              timeRemaining: world.timeRemaining,
              isFinished: world.isFinished,
            });
          }
          return 0; // 0 will display "START!"
        }
        if (prev === 0) {
          clearInterval(interval);
          return null; // hide countdown entirely
        }
        playCountdownSound('tick');
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Main high speed game animation loop
  useEffect(() => {
    let active = true;

    const gameLoop = (timestamp: number) => {
      if (!active) return;

      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = Math.min(timestamp - lastTimeRef.current, 100); // capped safety
      lastTimeRef.current = timestamp;

      // 1. Update positions & handle custom game frame logic
      updateGameEngine(deltaTime);

      // 2. Render Canvas Viewport
      renderGameFrame();

      // Periodically propagate current live state back to GameHUD React tree
      frameCountRef.current++;
      if (frameCountRef.current % 10 === 0) {
        if (onStateChangeRef.current) {
          onStateChangeRef.current({
            players: [...worldRef.current.players],
            timeRemaining: worldRef.current.timeRemaining,
            isFinished: worldRef.current.isFinished,
          });
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [dimensions]);

  // Periodic clock countdown tick
  useEffect(() => {
    const clock = setInterval(() => {
      const world = worldRef.current;
      if (world.isStarted && !world.isFinished) {
        if (world.timeRemaining <= 1) {
          world.timeRemaining = 0;
          world.isFinished = true;
          handleGameOverSequence();
        } else {
          world.timeRemaining -= 1;
        }

        // Propagate state change on tick
        if (onStateChangeRef.current) {
          onStateChangeRef.current({
            players: [...world.players],
            timeRemaining: world.timeRemaining,
            isFinished: world.isFinished,
          });
        }
      }
    }, 1000);

    return () => clearInterval(clock);
  }, [mode]);

  function handleGameOverSequence() {
    const world = worldRef.current;
    
    // Process list with ranks and times
    const rankings = world.players.map((p) => {
      // Calculate total score including completion and coupon bonuses
      const scoreBonus = p.isFinished ? 50000 : 0;
      const totalScore = p.score + bonusCalculation(p) + scoreBonus;
      return {
        name: p.name,
        score: totalScore,
        charType: p.charType,
        isMe: p.id === localPlayerId,
        isBot: p.id === 'bot',
        isDead: p.isDead,
        isFinished: p.isFinished,
        finishRank: p.finishRank || 999,
        finishTime: p.finishTime || 9999999,
      };
    }).sort((a, b) => {
      // 1. If both finished, order by finishRank (1st, 2nd, etc.)
      if (a.isFinished && b.isFinished) {
        return a.finishRank - b.finishRank;
      }
      // 2. Finished players rank above unfinished ones
      if (a.isFinished) return -1;
      if (b.isFinished) return 1;
      // 3. Fallback to high score for uncompleted players
      return b.score - a.score;
    });

    // The winner is whoever takes the absolute first place in the sorted ranking list!
    const winner = rankings[0] ? rankings[0].name : '시간 초과 무승부';

    const p1 = world.players.find((p) => p.id === localPlayerId);
    const p2 = world.players.find((p) => p.id !== localPlayerId);

    onGameOver(winner, p1?.score || 0, p2?.score || 0, rankings);
  }

  function bonusCalculation(p: PlayerState) {
    return p.couponCount * 2500;
  }

  // CORE GAME SIMULATION ENGINE
  function updateGameEngine(deltaTime: number) {
    const world = worldRef.current;
    if (!world.isStarted || world.isFinished) return;

    // Update Particles
    world.particles.forEach((part) => {
      part.x += part.vx;
      part.y += part.vy;
      part.vy += 0.05; // gravity drift
      part.life -= 0.016; // decay
    });
    world.particles = world.particles.filter((p) => p.life > 0);

    // Update Coin animation pulses
    world.coins.forEach((c) => {
      c.pulseOffset += 0.08;
    });

    // Handle BOT AI if solo mode
    if (mode === 'SOLO') {
      const bot = world.players.find((p) => p.id === 'bot');
      if (bot && !bot.isDead && !bot.isFinished) {
        const botInputs = updateBotAI(bot, world);
        simulatePlayerInputs(bot, botInputs, deltaTime);
      }
    }

    // Process human inputs
    world.players.forEach((player) => {
      if (player.isDead) return;

      const isP1 = player.id === localPlayerId || player.id === 'local-1';
      const isP2 = player.id === 'local-2';

      if (isP1) {
        // Keyboard map for Player 1: WASD (and Arrows in solo/online only, separated in local 2-player)
        const isLocalVersus = mode === 'LOCAL_VERSUS';
        const inputsP1 = {
          left: keysRef.current['KeyA'] || (!isLocalVersus && keysRef.current['ArrowLeft']) || false,
          right: keysRef.current['KeyD'] || (!isLocalVersus && keysRef.current['ArrowRight']) || false,
          jump: keysRef.current['KeyW'] || keysRef.current['Space'] || (!isLocalVersus && keysRef.current['ArrowUp']) || false,
        };
        applyPlayerInputs(player, inputsP1, deltaTime);
      } else if (isP2 && mode === 'LOCAL_VERSUS') {
        // Keyboard map for Player 2: Arrow Keys (ArrowLeft/ArrowRight/ArrowUp) or fallback JLI keys
        const inputsP2 = {
          left: keysRef.current['ArrowLeft'] || keysRef.current['KeyJ'] || false,
          right: keysRef.current['ArrowRight'] || keysRef.current['KeyL'] || false,
          jump: keysRef.current['ArrowUp'] || keysRef.current['KeyI'] || keysRef.current['Numpad0'] || false,
        };
        applyPlayerInputs(player, inputsP2, deltaTime);
      }
    });

    // Update Enemies AI & positions
    world.enemies.forEach((enemy) => {
      if (enemy.isDead) {
        if (!enemy.deadTimer) enemy.deadTimer = 0;
        enemy.deadTimer += deltaTime;
        if (enemy.deadTimer > 4000) { // Respawn after 4 seconds
          enemy.isDead = false;
          enemy.deadTimer = 0;
          enemy.x = enemy.spawnX ?? enemy.x;
          enemy.y = enemy.spawnY ?? enemy.y;
          spawnItemParticle(world, enemy.x, enemy.y - 10, '🍄 굼바 리포탈!', '#a855f7');
        }
        return;
      }

      if (enemy.type === 'shipping_fee' || enemy.type === 'goomba') {
        enemy.x += enemy.vx;
        
        // Patrol limits or bounce on gap boundaries
        let hitsWall = false;
        // Check ground boundary
        let isGrounded = false;
        world.blocks.forEach((bg) => {
          if (bg.type === 'ground') {
            if (enemy.x >= bg.x && enemy.x <= bg.x + bg.width) {
              isGrounded = true;
            }
          }
        });

        // Simple bounce on bounds
        if (enemy.x < 0 || enemy.x > world.levelWidth - enemy.width || !isGrounded) {
          enemy.vx *= -1;
        }
      } else if (enemy.type === 'refund_ghost') {
        // Chases the nearest active player coordinates
        let nearestP: PlayerState | null = null;
        let minDist = 99999;

        world.players.forEach((p) => {
          if (!p.isDead && !p.isFinished) {
            const dist = Math.abs(p.x - enemy.x);
            if (dist < minDist) {
              minDist = dist;
              nearestP = p;
            }
          }
        });

        if (nearestP) {
          const dx = (nearestP as PlayerState).x - enemy.x;
          const dy = (nearestP as PlayerState).y - enemy.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 300) { // Aggro radius
            enemy.x += (dx / len) * 0.8;
            enemy.y += (dy / len) * 0.8;
          } else {
            // natural idle drift
            enemy.x += enemy.vx * 0.4;
            if (Math.random() < 0.02) enemy.vx *= -1;
          }
        }
      } else if (enemy.type === 'support_bot') {
        // High bouncing logic
        enemy.y += enemy.vy;
        enemy.vy += 0.15; // light gravity

        // Bounce from ground floor
        if (enemy.y > 520 - enemy.height) {
          enemy.y = 520 - enemy.height;
          enemy.vy = -5.5; // push back up!
        }
      }
    });

    // Resolve Collisions between all players, items, and structures
    world.players.forEach((player) => {
      if (player.isDead) return;

      // 1. Resolve player bounds against gaps & boundaries
      if (player.y > world.levelHeight) {
        // Slipped into shipping debt pit!
        damagePlayer(world, player, 1);
        if (!player.isDead) {
          player.x = 100; // Reset spawn
          player.y = 100;
          player.vx = 0;
          player.vy = 0;
        }
      }

      // Border bounds
      if (player.x < 0) player.x = 0;
      if (player.x > world.levelWidth - player.width) player.x = world.levelWidth - player.width;

      // 2. Block Collisions
      player.isGrounded = false;
      const originalY = player.y;
      const pSize = getPlayerSize(player);

      world.blocks.forEach((block) => {
        // AABB Collision overlap checking
        const px = player.x;
        const py = player.y;
        const pw = pSize.w;
        const ph = pSize.h;

        if (
          px + pw > block.x &&
          px < block.x + block.width &&
          py + ph > block.y &&
          py < block.y + block.height
        ) {
          // Detect hit angle
          const overlapLeft = px + pw - block.x;
          const overlapRight = block.x + block.width - px;
          const overlapTop = py + ph - block.y;
          const Math_min = Math.min; // Local reference to ensure fast performance
          const overlapBottom = block.y + block.height - py;

          const smallest = Math_min(overlapLeft, overlapRight, overlapTop, overlapBottom);

          if (smallest === overlapTop && player.vy >= 0) {
            // Landing on top of block
            player.y = block.y - ph;
            player.vy = 0;
            player.isGrounded = true;

            // Handle Spring Launcher bounce!
            if (block.type === 'spring') {
              player.vy = -18; // SUPER BOUNCE!
              spawnItemParticle(world, block.x + 10, block.y - 10, '🚀 무료 우주특송 발사!', '#fb923c');
            }
          } else if (smallest === overlapBottom) {
            // Hitting head on block underside
            player.y = block.y + block.height;
            player.vy = 0.5;

            // Trigger Block activation!
            if ((block.type === 'temu_box' || block.type === 'coupon_block' || block.type === 'brick') && !block.isHit) {
              block.isHit = true;

              // Break standard bricks, or spawn items
              if (block.type === 'brick') {
                spawnItemParticle(world, block.x, block.y, '💥 박살!', '#ea580c');
              } else if (block.type === 'coupon_block') {
                player.couponCount += 1;
                player.score += 2500;
                spawnItemParticle(world, block.x, block.y - 12, '🎟️ +$2,500 할인적용!', '#ff4400');
              } else if (block.type === 'temu_box') {
                player.score += 1000;
                const reward = block.containsItem;
                if (reward) {
                  if (reward === 'coin') {
                    player.score += 1500;
                    spawnItemParticle(world, block.x, block.y - 12, '🪙 +$1,500 적립', '#eab308');
                  } else {
                    const mushType = (reward === 'giant_foam' || reward === 'mini_foam') ? 'growth' : 'speed';
                    spawnMushroom(world, block.x, block.y, mushType);
                    spawnItemParticle(
                      world,
                      block.x,
                      block.y - 25,
                      mushType === 'growth' ? '🍄 성장의 기가 버섯!' : '⚡ 질주의 가속 버섯!',
                      mushType === 'growth' ? '#a855f7' : '#f59e0b'
                    );
                  }
                }
              }

              // Notify Server of block impact in P2P room
              if (mode === 'ONLINE_P2P' && player.id === localPlayerId) {
                sendWSMessage({
                  type: 'SYNC_GAME_STATE',
                  payload: { player, blockHitId: block.id },
                });
              }
            }
          } else if (smallest === overlapLeft) {
            // Hitting left boundary
            player.x = block.x - pw;
            player.vx = 0;
          } else if (smallest === overlapRight) {
            // Hitting right boundary
            player.x = block.x + block.width;
            player.vx = 0;
          }
        }
      });

      // 3. Collect Coins
      world.coins.forEach((coin) => {
        if (coin.isCollected) return;

        const px = player.x;
        const py = player.y;
        const pw = pSize.w;
        const ph = pSize.h;

        if (
          px + pw > coin.x &&
          px < coin.x + coin.width &&
          py + ph > coin.y &&
          py < coin.y + coin.height
        ) {
          coin.isCollected = true;
          player.score += 5000; // Large currency reward!

          // Hunter perk: magnets speed up adjacent coins but standard overlap collects
          spawnItemParticle(world, coin.x - 10, coin.y - 10, '🪙 +50% 저장 $5,000!', '#fb923c');

          if (mode === 'ONLINE_P2P' && player.id === localPlayerId) {
            sendWSMessage({
              type: 'SYNC_GAME_STATE',
              payload: { player, coinGrabId: coin.id },
            });
          }
        }
      });

      // 4. Enemy stomps & damage resolution
      world.enemies.forEach((enemy) => {
        if (enemy.isDead) return;

        const px = player.x;
        const py = player.y;
        const pw = pSize.w;
        const ph = pSize.h;

        if (
          px + pw > enemy.x &&
          px < enemy.x + enemy.width &&
          py + ph > enemy.y &&
          py < enemy.y + enemy.height
        ) {
          // Giant form breaks enemies instantly
          const isGiant = player.powerup?.type === 'giant_foam';
          const isStomp = player.vy > 0 && py + ph - player.vy <= enemy.y + 16 && enemy.type !== 'out_of_stock';

          if (isGiant || isStomp) {
            // Smash enemy!
            enemy.isDead = true;
            player.vy = -10; // bounce player
            player.score += 10000;

            const stompText = enemy.type === 'goomba' ? '🍄 굼바 격파 성사! +$10,000' : isGiant ? '🚙 기가 자이언트 분쇄!' : '🔨 세금 폭탄 밟아 격파!';
            spawnItemParticle(world, enemy.x, enemy.y - 15, stompText, '#10b981');

            if (mode === 'ONLINE_P2P' && player.id === localPlayerId) {
              sendWSMessage({
                type: 'SYNC_GAME_STATE',
                payload: { player, enemyKillId: enemy.id },
              });
            }
          } else {
            // Player gets hit by enemy!
            if (player.hasShield) {
              player.hasShield = false;
              if (player.powerup) player.powerup.visualActive = false;
              spawnItemParticle(world, player.x, player.y - 20, '🛡️ 배송 쉴드가 데미지를 막았습니다!', '#3b82f6');
              enemy.isDead = true; // eliminate threat
            } else {
              // Knockback & damage
              damagePlayer(world, player, 1);
              if (!player.isDead) {
                player.vy = -6;
                player.vx = player.x < enemy.x ? -6 : 6;
                spawnItemParticle(world, player.x, player.y - 20, '⚠️ 추가 배송비 탕진! 피격!', '#ef4444');
              }
            }
          }
        }
      });

      // Mario-style Player-to-Player Stomping (stomp kills other player and sends them to the beginning)
      world.players.forEach((other) => {
        if (other.id === player.id || other.isDead || other.isFinished) return;

        const oSize = getPlayerSize(other);
        const px = player.x;
        const py = player.y;
        const pw = pSize.w;
        const ph = pSize.h;

        if (
          px + pw > other.x &&
          px < other.x + oSize.w &&
          py + ph > other.y &&
          py < other.y + oSize.h
        ) {
          // Check if player lands from above onto other's head
          const isStompingOther = player.vy > 0 && (py + ph - player.vy) <= other.y + 16;

          if (isStompingOther) {
            player.vy = -12; // bounce attacker high!
            damagePlayer(world, other, 1); // damage and reset other player back to starting line

            spawnItemParticle(world, player.x, player.y - 20, `💥 밟기! ${other.name} 제압!`, '#fb923c');

            if (mode === 'ONLINE_P2P' && player.id === localPlayerId) {
              sendWSMessage({
                type: 'SYNC_GAME_STATE',
                payload: { player, remoteStompedId: other.id },
              });
            }
          }
        }
      });

      // 5. Reach Finish Flag
      const flag = world.blocks.find((b) => b.type === 'finish_flag');
      if (flag) {
        if (player.x + player.width >= flag.x && !player.isFinished) {
          player.isFinished = true;
          player.finishTime = 60000 - world.timeRemaining * 1000; // record elapsed ms based on 60s limit
          
          // Calculate finish rank dynamically by counting how many players have already finished (including current)
          const alreadyFinishedCount = world.players.filter(p => p.isFinished).length;
          player.finishRank = alreadyFinishedCount;

          // Prize points based on finish rank: 1st (+40,000), 2nd (+30,000), 3rd (+20,000), others (+10,000)
          const rankBonus = Math.max(10000, 50000 - alreadyFinishedCount * 10000);
          player.score += rankBonus;

          spawnItemParticle(world, flag.x, flag.y + 100, `🏆 ${player.finishRank}위 골인: ${player.name}!! 🏆`, '#10b981');

          // Check if game is completed for everyone
          const allHumansFinishedOrDead = world.players
            .filter((p) => p.id !== 'bot')
            .every((p) => p.isFinished || p.isDead);

          if (allHumansFinishedOrDead || mode === 'SOLO') {
            world.isFinished = true;
            setTimeout(() => {
              handleGameOverSequence();
            }, 3000);
          }
        }
      }
    });

    // Send cyclic state coordinates if Online
    if (mode === 'ONLINE_P2P' && wsConnection) {
      const self = world.players.find((p) => p.id === localPlayerId);
      if (self) {
        sendWSMessage({
          type: 'SYNC_GAME_STATE',
          payload: { player: self },
        });
      }
    }

    // --- Update Mushrooms physics and collisions ---
    world.mushrooms = world.mushrooms || [];
    world.mushrooms.forEach((mush) => {
      if (mush.isCollected) return;

      // Gravity and movement
      mush.vy += world.gravity;
      mush.y += mush.vy;
      mush.x += mush.vx;

      // Platform boundaries limit
      if (mush.x < 0) {
        mush.x = 0;
        mush.vx *= -1;
      }
      if (mush.x > world.levelWidth - mush.width) {
        mush.x = world.levelWidth - mush.width;
        mush.vx *= -1;
      }

      // Collide with ground floor (Y = 520) if it is over solid ground
      if (mush.y > 520 - mush.height) {
        // Only trigger solid ground if within solid segments
        const onGroundSegment = world.blocks.some(
          b => b.type === 'ground' && mush.x + mush.width > b.x && mush.x < b.x + b.width
        );
        if (onGroundSegment) {
          mush.y = 520 - mush.height;
          mush.vy = 0;
        } else if (mush.y > world.levelHeight) {
          // Fallen into pit
          mush.isCollected = true;
        }
      }

      // Collide with other blocks (brick, temu_box, etc.)
      world.blocks.forEach((block) => {
        if (
          mush.x + mush.width > block.x &&
          mush.x < block.x + block.width &&
          mush.y + mush.height > block.y &&
          mush.y < block.y + block.height
        ) {
          const overlapT = (mush.y + mush.height) - block.y;
          const overlapB = (block.y + block.height) - mush.y;
          const overlapL = (mush.x + mush.width) - block.x;
          const overlapR = (block.x + block.width) - mush.x;
          const smallest = Math.min(overlapT, overlapB, overlapL, overlapR);

          if (smallest === overlapT && mush.vy > 0) {
            mush.y = block.y - mush.height;
            mush.vy = 0;
          } else if (smallest === overlapL) {
            mush.x = block.x - mush.width;
            mush.vx *= -1;
          } else if (smallest === overlapR) {
            mush.x = block.x + block.width;
            mush.vx *= -1;
          }
        }
      });

      // Player collision devouring mushrooms
      world.players.forEach((player) => {
        if (player.isDead || player.isFinished || mush.isCollected) return;

        const pSize = getPlayerSize(player);
        if (
          mush.x + mush.width > player.x &&
          mush.x < player.x + pSize.w &&
          mush.y + mush.height > player.y &&
          mush.y < player.y + pSize.h
        ) {
          mush.isCollected = true;
          playPowerupSound();

          if (mush.type === 'growth') {
            applyPowerupToPlayer(world, player, 'giant_foam');
            spawnItemParticle(world, player.x, player.y - 20, '🍄 냠냠! 기가 버섯 획득 (몸집 거대화!)', '#a855f7');
          } else {
            applyPowerupToPlayer(world, player, 'speed_shoes');
            spawnItemParticle(world, player.x, player.y - 20, '⚡ 마구 달리기! 초특가 질주 버섯 획득!', '#f59e0b');
          }
        }
      });
    });
  }

  function simulatePlayerInputs(player: PlayerState, inputs: Record<string, boolean>, deltaTime: number) {
    const isP1Inputs = {
      left: inputs.ArrowLeft || false,
      right: inputs.ArrowRight || false,
      jump: inputs.ArrowUp || false,
    };
    applyPlayerInputs(player, isP1Inputs, deltaTime);
  }

  function applyPlayerInputs(player: PlayerState, inputs: { left: boolean; right: boolean; jump: boolean }, deltaTime: number) {
    const hasSpeedShoes = player.powerup?.type === 'speed_shoes' && player.powerup?.visualActive;

    // Movement multipliers
    let speedAccel = 0.5;
    let maxSpeed = speedMultiplier(player.charType);

    if (hasSpeedShoes) {
      maxSpeed *= 1.8;
      speedAccel *= 1.8;
    }

    // Apply movement
    if (inputs.left) {
      player.vx = Math.max(player.vx - speedAccel, -maxSpeed);
      player.facingLeft = true;
    } else if (inputs.right) {
      player.vx = Math.min(player.vx + speedAccel, maxSpeed);
      player.facingLeft = false;
    } else {
      // Apply friction
      player.vx *= 0.85;
      if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }

    // Gravity
    player.vy += 0.6; // Gravity const

    // Jump
    if (inputs.jump && player.isGrounded) {
      let jumpVelocity = jumpHeightMultiplier(player.charType);
      
      // Giant makes higher jumps but falls heavier
      if (player.powerup?.type === 'giant_foam' && player.powerup?.visualActive) {
        jumpVelocity *= 1.15;
      }

      player.vy = -jumpVelocity;
      player.isGrounded = false;
    }

    // Perform physics displacement
    player.x += player.vx;
    player.y += player.vy;
  }

  function speedMultiplier(char: CharacterType): number {
    return 5.0; // Uniform speed for all characters
  }

  function jumpHeightMultiplier(char: CharacterType): number {
    return 12.5; // Uniform jump high for all characters
  }

  function damagePlayer(world: GameWorld, player: PlayerState, cost: number) {
    if (player.invincibleUntil && Date.now() < player.invincibleUntil) {
      return; // Under active invincibility shield
    }

    player.lives -= cost;
    if (player.lives <= 0) {
      player.lives = 3; // Infinite resurrection! Restores hearts
      player.x = 80 + Math.random() * 40;
      player.y = 100;
      player.vx = 0;
      player.vy = 0;
      player.invincibleUntil = Date.now() + 3000; // 3 seconds invincibility!
      spawnItemParticle(world, player.x, player.y - 20, '♻️ 부활! 무한 라이프로 계속 달리기! 🛡️', '#3b82f6');
    } else {
      // Send back to the beginning!
      player.x = 80 + Math.random() * 40;
      player.y = 100;
      player.vx = 0;
      player.vy = 0;
      player.invincibleUntil = Date.now() + 3000; // 3 seconds invincibility!
      spawnItemParticle(world, player.x, player.y - 20, '♻️ 처음부터 다시 출발! (무적 3초! 🛡️)', '#60a5fa');
    }
  }

  function applyPowerupToPlayer(world: GameWorld, player: PlayerState, buff: 'speed_shoes' | 'giant_foam' | 'lightning_shield' | 'popup_attack' | 'coupon_rain' | 'scam_box' | 'mini_foam') {
    if (buff === 'coupon_rain') {
      player.couponCount += 10;
      player.score += 25000;
      return;
    }

    if (buff === 'lightning_shield') {
      player.hasShield = true;
    }

    player.powerup = {
      type: buff as any,
      expiresAt: Date.now() + 8000, // 8 seconds buff duration
      visualActive: true,
    };

    // Auto cleanup buff timer
    setTimeout(() => {
      const upd = worldRef.current.players.find((p) => p.id === player.id);
      if (upd && upd.powerup) {
        upd.powerup.visualActive = false;
        upd.hasShield = false;
      }
    }, 8000);
  }

  function spawnItemParticle(world: GameWorld, x: number, y: number, text: string, color = '#f59e0b') {
    world.particles.push({
      id: Math.random().toString(),
      x,
      y,
      vx: (Math.random() - 0.5) * 4,
      vy: -3 - Math.random() * 3,
      text,
      color,
      life: 1.0,
      size: 11 + Math.random() * 5,
    });
  }

  function spawnMushroom(world: GameWorld, x: number, y: number, type: 'growth' | 'speed') {
    world.mushrooms = world.mushrooms || [];
    world.mushrooms.push({
      id: `mush-${Date.now()}-${Math.random()}`,
      x: x + 7,
      y: y - 25,
      vx: Math.random() < 0.5 ? -1.6 : 1.6, // Bounces/slides left or right
      vy: -4, // Bounces upward initially
      width: 25,
      height: 25,
      type,
      isCollected: false,
    });
  }

  function playPowerupSound() {
    try {
      const gAudio = window.AudioContext || (window as any).webkitAudioContext;
      if (!gAudio) return;
      const ctx = new gAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  function sendWSMessage(msg: WSMessage) {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify(msg));
    }
  }

  // --- RENDER ENGINE DRAW TO HTML5 CANVAS ---
  function renderGameFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nativeWidth = dimensions.width;
    const nativeHeight = dimensions.height;

    // Scale canvas buffer
    canvas.width = nativeWidth;
    canvas.height = nativeHeight;

    const world = worldRef.current;

    // Viewport scroll relative to Local Player position
    const selfPlayer = world.players.find((p) => p.id === localPlayerId) || world.players[0];
    let cameraX = 0;
    if (selfPlayer) {
      cameraX = selfPlayer.x - nativeWidth / 2 + 16;
      const maxCameraX = world.levelWidth - nativeWidth;
      if (cameraX < 0) cameraX = 0;
      if (cameraX > maxCameraX) cameraX = maxCameraX;
    }

    // DRAW BACKGROUND (Cyberpunk e-commerce aesthetics!)
    // Bright High Contrast sky blue that looks amazing and makes empty holes highly visible!
    ctx.fillStyle = '#bae6fd'; // Light sky-blue
    ctx.fillRect(0, 0, nativeWidth, nativeHeight);

    // Floating Grid Lines in soft subtle gray/blue
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 1;
    const gridSpacing = 40;
    const offsetX = -cameraX % gridSpacing;
    for (let x = offsetX; x < nativeWidth; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, nativeHeight);
      ctx.stroke();
    }
    for (let y = 0; y < nativeHeight; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(nativeWidth, y);
      ctx.stroke();
    }

    // Warm Glow gradient on horizon
    const grad = ctx.createLinearGradient(0, nativeHeight - 160, 0, nativeHeight);
    grad.addColorStop(0, 'rgba(234, 88, 12, 0.0)');
    grad.addColorStop(1, 'rgba(234, 88, 12, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, nativeWidth, nativeHeight);

    // Draw Satirical Floating Ads in Background clouds
    ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
    ctx.font = '900 60px "Outfit"';
    ctx.fillText('⚡ 99.9% SHOCKED PRICE', 200 - cameraX * 0.2, 100);
    ctx.fillText('🎟️ FREE SHIPPING FOR ALL', 1800 - cameraX * 0.2, 120);
    ctx.fillText('📦 UNBOX UNLIMITED TOXIC GIFTS', 3200 - cameraX * 0.2, 100);

    // DRAW FALLING PITS WARNING CAUTION REGIONS
    const pitsList = [
      { start: 800, end: 950 },
      { start: 1600, end: 1750 },
      { start: 2400, end: 2550 },
      { start: 3200, end: 3350 },
    ];
    pitsList.forEach((pit) => {
      const rxLeft = pit.start - cameraX;
      const rxRight = pit.end - cameraX;
      const pitY = 520;

      // 5. High-Power Security Laser Walls at the edges of the pit (Y = 0 to Y = 520)
      const laserPulse = 0.5 + Math.sin(Date.now() / 80) * 0.45; // Blinking super fast
      
      // Draw Left Border Vertical red warning laser
      if (rxLeft >= 0 && rxLeft <= nativeWidth) {
        ctx.save();
        // Red glowing halo
        ctx.strokeStyle = `rgba(239, 68, 68, ${laserPulse * 0.35})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(rxLeft, 0);
        ctx.lineTo(rxLeft, pitY);
        ctx.stroke();
        
        // Inner intense core
        ctx.strokeStyle = `rgba(255, 255, 255, ${laserPulse})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(rxLeft, 0);
        ctx.lineTo(rxLeft, pitY);
        ctx.stroke();
        
        // Solid thin red line
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rxLeft, 0);
        ctx.lineTo(rxLeft, pitY);
        ctx.stroke();
        
        // Laser Text: 🚨 DANGER - CLIFF 🚨
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 8.5px "Space Grotesk", sans-serif';
        ctx.save();
        ctx.translate(rxLeft - 7, 180);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('🚨 DETECTED CHASM AREA 🚨', 0, 0);
        ctx.restore();
        
        ctx.restore();
      }
      
      // Draw Right Border Vertical red warning laser
      if (rxRight >= 0 && rxRight <= nativeWidth) {
        ctx.save();
        // Red glowing halo
        ctx.strokeStyle = `rgba(239, 68, 68, ${laserPulse * 0.35})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(rxRight, 0);
        ctx.lineTo(rxRight, pitY);
        ctx.stroke();
        
        // Inner intense core
        ctx.strokeStyle = `rgba(255, 255, 255, ${laserPulse})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(rxRight, 0);
        ctx.lineTo(rxRight, pitY);
        ctx.stroke();
        
        // Solid thin red line
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rxRight, 0);
        ctx.lineTo(rxRight, pitY);
        ctx.stroke();
        
        // Laser Text
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 8.5px "Space Grotesk", sans-serif';
        ctx.save();
        ctx.translate(rxRight + 13, 180);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('🚨 DETECTED CHASM AREA 🚨', 0, 0);
        ctx.restore();
        
        ctx.restore();
      }

      // 6. Styled physical caution billboard signpost standing on ground at pit.start - 80 (if visible)
      const signX = pit.start - 80 - cameraX;
      if (signX + 60 >= 0 && signX - 60 <= nativeWidth) {
        ctx.save();
        
        // Dual steel bars poles
        ctx.fillStyle = '#475569';
        ctx.fillRect(signX - 10, pitY - 60, 4, 60);
        ctx.fillRect(signX + 6, pitY - 60, 4, 60);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(signX - 10, pitY - 60, 4, 60);
        ctx.strokeRect(signX + 6, pitY - 60, 4, 65);
        
        // Neon Sign Board
        ctx.fillStyle = '#facc15'; // Bright safety yellow
        ctx.fillRect(signX - 45, pitY - 110, 90, 50);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(signX - 45, pitY - 110, 90, 50);
        
        // Horizontal black/yellow stripes on board
        ctx.fillStyle = '#000000';
        ctx.fillRect(signX - 45, pitY - 110, 90, 6);
        ctx.fillRect(signX - 45, pitY - 66, 90, 6);
        
        // Warning Sign symbol "⚠️"
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️', signX, pitY - 92);
        
        // Korean instruction text
        ctx.fillStyle = '#000000';
        ctx.font = '900 8.5px sans-serif';
        ctx.fillText('앞에 절벽 구역!', signX, pitY - 78);
        ctx.fillStyle = '#b91c1c';
        ctx.font = '900 7px "JetBrains Mono", sans-serif';
        ctx.fillText('⚠️ FALLING CHASM', signX, pitY - 70);
        
        // Red flashing neon warning light bulb on top of caution billboard
        const bulbFlash = Math.floor(Date.now() / 150) % 2 === 0;
        ctx.fillStyle = bulbFlash ? '#ef4444' : '#fecaca';
        ctx.beginPath();
        ctx.arc(signX, pitY - 115, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
      }

      if (pit.end < cameraX || pit.start > cameraX + nativeWidth) return;
      const rxStart = Math.max(0, pit.start - cameraX);
      const rxEnd = Math.min(nativeWidth, pit.end - cameraX);
      const width = rxEnd - rxStart;
      if (width <= 0) return;

      ctx.save();
      const pitHeight = nativeHeight - pitY;

      // 1. Solid bottomless void background (Deep dark void showing the ground is completely cut away)
      ctx.fillStyle = '#0f0f15';
      ctx.fillRect(rxStart, pitY, width, pitHeight);

      // 2. Chasm perspective lines (Draw lines that recede down to give a bottomless hole feeling)
      for (let h = 0; h < pitHeight; h += 14) {
        // Perspective narrowing factor
        const alpha = Math.max(0, 1 - h / pitHeight);
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rxStart, pitY + h);
        ctx.lineTo(rxEnd, pitY + h);
        ctx.stroke();
      }

      // Vertical side lines on left and right borders of the pit representing cliff walls going down
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(rxStart, pitY);
      ctx.lineTo(rxStart, nativeHeight);
      ctx.moveTo(rxEnd, pitY);
      ctx.lineTo(rxEnd, nativeHeight);
      ctx.stroke();

      // 3. Falling warning arrows (animated)
      const arrowFlash = Math.floor(Date.now() / 250) % 3;
      ctx.fillStyle = '#ef4444';
      ctx.font = '900 13px "Outfit"';
      ctx.textAlign = 'center';
      
      const arrow1 = arrowFlash === 0 ? '▼' : '▽';
      const arrow2 = arrowFlash === 1 ? '▼' : '▽';
      const arrow3 = arrowFlash === 2 ? '▼' : '▽';
      
      ctx.fillText(arrow1, rxStart + width / 2, pitY + 16);
      ctx.fillText(arrow2, rxStart + width / 2, pitY + 32);
      ctx.fillText(arrow3, rxStart + width / 2, pitY + 48);

      // 4. Flashing safety laser on the platforming plane (Y = 520)
      const glowValue = Math.sin(Date.now() / 100) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(239, 68, 68, ${glowValue})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(rxStart, pitY);
      ctx.lineTo(rxEnd, pitY);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // Add a centered flashing text warning indicator inside each pit
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 8.5px "Outfit"';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ 추락 즉사구역 (PIT CHASM) ☠️', rxStart + width / 2, pitY + 68);

      ctx.restore();
    });

    // Determine if self player is approaching a pit in next 250px to draw hud caution alert banner
    let isPitAhead = false;
    let distanceToPit = 9999;
    if (selfPlayer && !selfPlayer.isDead && !selfPlayer.isFinished) {
      pitsList.forEach((pit) => {
        const dist = pit.start - selfPlayer.x;
        if (dist > 0 && dist < 240) {
          isPitAhead = true;
          if (dist < distanceToPit) {
            distanceToPit = dist;
          }
        }
      });
    }

    if (isPitAhead) {
      ctx.save();
      
      const bannerW = 320;
      const bannerH = 44;
      const bannerX = (nativeWidth - bannerW) / 2;
      const bannerY = 45;
      
      // Box drawing with blinking red caution aura
      ctx.fillStyle = '#dc2626';
      const hudPulse = Math.sin(Date.now() / 80) * 0.2 + 0.8;
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 10 * hudPulse;
      ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 0; // reset shadow
      ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);
      
      // Left and right hazard warning borders
      ctx.fillStyle = '#facc15';
      ctx.fillRect(bannerX + 4, bannerY + 4, 30, bannerH - 8);
      ctx.fillRect(bannerX + bannerW - 34, bannerY + 4, 30, bannerH - 8);
      
      ctx.fillStyle = '#000000';
      for (const offset of [0, 10, 20]) {
        ctx.beginPath();
        ctx.moveTo(bannerX + 4 + offset, bannerY + 4);
        ctx.lineTo(bannerX + 4 + offset + 6, bannerY + 4);
        ctx.lineTo(bannerX + 4 + offset, bannerY + bannerH - 4);
        ctx.lineTo(bannerX + 4 + offset - 6, bannerY + bannerH - 4);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(bannerX + bannerW - 34 + offset, bannerY + 4);
        ctx.lineTo(bannerX + bannerW - 34 + offset + 6, bannerY + 4);
        ctx.lineTo(bannerX + bannerW - 34 + offset, bannerY + bannerH - 4);
        ctx.lineTo(bannerX + bannerW - 34 + offset - 6, bannerY + bannerH - 4);
        ctx.closePath();
        ctx.fill();
      }
      
      // HUD Header text warning the player
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11.5px sans-serif';
      ctx.textAlign = 'center';
      
      ctx.fillText(`🚨 전방 [절벽 즉사구역] 감지! (${Math.round(distanceToPit)}px 남음)`, bannerX + bannerW / 2, bannerY + 18);
      
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 9px sans-serif';
      ctx.fillText('즉시 점프 버튼 준비! ⌨️ [UP / SPACE / W]', bannerX + bannerW / 2, bannerY + 32);
      
      ctx.restore();
    }

    // DRAW BLOCKS & FLOOR
    world.blocks.forEach((block) => {
      // Skip if completely out of viewport
      if (block.x + block.width < cameraX || block.x > cameraX + nativeWidth) return;

      const rx = block.x - cameraX;
      const ry = block.y;

      // Draw depending on Type
      if (block.type === 'ground') {
        const rHeight = block.height;
        
        // 1. Draw robust layered stone bedrock representing the solid earth
        const rockGrad = ctx.createLinearGradient(rx, ry, rx, ry + rHeight);
        rockGrad.addColorStop(0, '#475569');   // Cool slate-gray top soil bedrock
        rockGrad.addColorStop(0.3, '#1e293b'); // Dark carbonaceous hard stone layers
        rockGrad.addColorStop(1.0, '#020617'); // Pitch space dark bottom bedrock
        ctx.fillStyle = rockGrad;
        ctx.fillRect(rx, ry, block.width, rHeight);

        // 2. Draw organic geological mineral veins/fissures in rock
        ctx.save();
        ctx.fillStyle = '#334155';
        ctx.fillRect(rx, ry + 24, block.width, 5);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(rx, ry + 48, block.width, 8);
        
        // Dynamic horizontal circuits suggesting cyberpunk subterranean server cables!
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let bx = rx - (rx % 80); bx < rx + block.width; bx += 80) {
          ctx.moveTo(bx, ry + 32);
          ctx.lineTo(bx + 20, ry + 44);
          ctx.lineTo(bx + 50, ry + 44);
          ctx.lineTo(bx + 65, ry + 28);
        }
        ctx.stroke();
        ctx.restore();

        // 3. Draw a stylized hazard bumper strip on top of the ground (Y = 520 to 534)
        ctx.save();
        ctx.fillStyle = '#ea580c'; // Saturated orange top lip
        ctx.fillRect(rx, ry, block.width, 10);
        
        // Safety yellow attention bar underneath
        ctx.fillStyle = '#eab308';
        ctx.fillRect(rx, ry + 10, block.width, 4);
        
        // Warning diagonal ticks inside yellow strip
        ctx.fillStyle = '#000000';
        for (let tx = rx - (rx % 16); tx < rx + block.width; tx += 16) {
          ctx.beginPath();
          ctx.moveTo(tx, ry + 10);
          ctx.lineTo(tx + 6, ry + 10);
          ctx.lineTo(tx, ry + 14);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Highlight/Warning zones on top of ground that border a pit directly!
        const pitStarts = [800, 1600, 2400, 3200];
        const pitEnds = [950, 1750, 2550, 3350];
        
        const blockRightX = block.x + block.width;
        const blockLeftX = block.x;
        
        ctx.save();
        
        // Borders pit on the RIGHT side (falling cliff ahead)
        if (pitStarts.includes(blockRightX)) {
          const warnWidth = 140;
          const warnStartX = rx + block.width - warnWidth;
          
          // Flashing warning red/yellow background
          const flash = Math.floor(Date.now() / 150) % 2 === 0;
          ctx.fillStyle = flash ? '#dc2626' : '#eab308';
          ctx.fillRect(warnStartX, ry, warnWidth, 18);
          
          // Heavy black hazard diagonal caution lines
          ctx.fillStyle = '#000000';
          for (let sx = warnStartX; sx < rx + block.width; sx += 16) {
            ctx.beginPath();
            ctx.moveTo(sx, ry);
            ctx.lineTo(sx + 8, ry);
            ctx.lineTo(sx, ry + 18);
            ctx.lineTo(sx - 8, ry + 18);
            ctx.closePath();
            ctx.fill();
          }
          
          // Top solid borders
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(warnStartX, ry);
          ctx.lineTo(rx + block.width, ry);
          ctx.stroke();
          
          // Red safety border line underneath caution strip
          ctx.strokeStyle = '#ff0000';
          ctx.beginPath();
          ctx.moveTo(warnStartX, ry + 18);
          ctx.lineTo(rx + block.width, ry + 18);
          ctx.stroke();
          
          // Write BOLD WARNING TEXT
          ctx.fillStyle = '#ffffff';
          ctx.font = '900 10px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('⚠️ 즉시 점프!! ☠️', rx + block.width - 8, ry + 13);

          // Draw the physical RIGHT jagged rock fractures mapping to bottom of cliff
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.moveTo(rx + block.width, ry + 18);
          ctx.lineTo(rx + block.width - 7, ry + 32);
          ctx.lineTo(rx + block.width - 2, ry + 46);
          ctx.lineTo(rx + block.width - 12, ry + 62);
          ctx.lineTo(rx + block.width - 4, ry + rHeight);
          ctx.lineTo(rx + block.width, ry + rHeight);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(rx + block.width, ry);
          ctx.lineTo(rx + block.width - 7, ry + 32);
          ctx.lineTo(rx + block.width - 2, ry + 46);
          ctx.lineTo(rx + block.width - 12, ry + 62);
          ctx.lineTo(rx + block.width - 4, ry + rHeight);
          ctx.stroke();
        }
        
        // Borders pit on the LEFT side (cliff landing floor)
        if (pitEnds.includes(blockLeftX)) {
          const warnWidth = 140;
          const warnStartX = rx;
          
          // Flashing warning background
          const flash = Math.floor(Date.now() / 150) % 2 === 0;
          ctx.fillStyle = flash ? '#dc2626' : '#eab308';
          ctx.fillRect(warnStartX, ry, warnWidth, 18);
          
          // Heavy black hazard diagonal caution lines
          ctx.fillStyle = '#000000';
          for (let sx = warnStartX; sx < warnStartX + warnWidth; sx += 16) {
            ctx.beginPath();
            ctx.moveTo(sx, ry);
            ctx.lineTo(sx + 8, ry);
            ctx.lineTo(sx, ry + 18);
            ctx.lineTo(sx - 8, ry + 18);
            ctx.closePath();
            ctx.fill();
          }
          
          // Top solid borders
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(warnStartX, ry);
          ctx.lineTo(warnStartX + warnWidth, ry);
          ctx.stroke();
          
          // Red safety border line underneath caution strip
          ctx.strokeStyle = '#ff0000';
          ctx.beginPath();
          ctx.moveTo(warnStartX, ry + 18);
          ctx.lineTo(warnStartX + warnWidth, ry + 18);
          ctx.stroke();
          
          // Write SAFE ZONE LANDING text
          ctx.fillStyle = '#ffffff';
          ctx.font = '900 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('☠️ 안전 착지구역 ⚠️', warnStartX + 8, ry + 13);

          // Draw the physical LEFT jagged rock fractures mapping to bottom of cliff
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.moveTo(rx, ry + 18);
          ctx.lineTo(rx + 7, ry + 32);
          ctx.lineTo(rx + 2, ry + 46);
          ctx.lineTo(rx + 11, ry + 62);
          ctx.lineTo(rx + 3, ry + rHeight);
          ctx.lineTo(rx, ry + rHeight);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + 7, ry + 32);
          ctx.lineTo(rx + 2, ry + 46);
          ctx.lineTo(rx + 11, ry + 62);
          ctx.lineTo(rx + 3, ry + rHeight);
          ctx.stroke();
        }
        
        ctx.restore();

        // Thick Brutalist outer black framing box outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeRect(rx, ry, block.width, block.height);

        // Neon Hazard stripe cliff endpoints on the left and right sides if not bordering a pit (internal joints)
        if (!pitEnds.includes(blockLeftX)) {
          ctx.fillStyle = '#eab308';
          ctx.fillRect(rx, ry, 6, block.height);
          ctx.fillStyle = '#000000';
          for (let sy = ry; sy < ry + block.height; sy += 12) {
            ctx.beginPath();
            ctx.moveTo(rx, sy);
            ctx.lineTo(rx + 6, sy + 6);
            ctx.lineTo(rx + 6, sy + 10);
            ctx.lineTo(rx, sy + 4);
            ctx.closePath();
            ctx.fill();
          }
        }
        
        if (!pitStarts.includes(blockRightX)) {
          ctx.fillStyle = '#eab308';
          ctx.fillRect(rx + block.width - 6, ry, 6, block.height);
          ctx.fillStyle = '#000000';
          for (let sy = ry; sy < ry + block.height; sy += 12) {
            ctx.beginPath();
            ctx.moveTo(rx + block.width - 6, sy);
            ctx.lineTo(rx + block.width, sy + 6);
            ctx.lineTo(rx + block.width, sy + 10);
            ctx.lineTo(rx + block.width - 6, sy + 4);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Subterranean rivets and structural line overlays inside bedrock
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1.5;
        for (let bx = rx + 30; bx < rx + block.width; bx += 40) {
          ctx.beginPath();
          ctx.moveTo(bx, ry);
          ctx.lineTo(bx, ry + block.height);
          ctx.stroke();
        }
      } else if (block.type === 'brick' || block.type === 'temu_box' || block.type === 'coupon_block') {
        // "박스는 ?박스만 만들고" -> All interactive block item types styled as amazing NES/Mario yellow question boxes!
        ctx.fillStyle = block.isHit ? '#64748b' : '#fac015'; // Deactivated flat grey or shiny active question gold
        ctx.fillRect(rx, ry, block.width, block.height);

        // Brutalist thick black borders
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(rx, ry, block.width, block.height);

        // Core decorative corner rivets
        ctx.fillStyle = '#000814';
        ctx.fillRect(rx + 4, ry + 4, 3, 3);
        ctx.fillRect(rx + block.width - 7, ry + 4, 3, 3);
        ctx.fillRect(rx + 4, ry + block.height - 7, 3, 3);
        ctx.fillRect(rx + block.width - 7, ry + block.height - 7, 3, 3);

        // Draw Question Mark symbol inside active boxes
        if (!block.isHit) {
          ctx.fillStyle = '#000000';
          ctx.font = '900 24px "Outfit"';
          ctx.textAlign = 'center';
          ctx.fillText('?', rx + block.width / 2, ry + block.height / 2 + 8);
        } else {
          ctx.fillStyle = '#cbd5e1';
          ctx.font = 'bold 15px "Outfit"';
          ctx.textAlign = 'center';
          ctx.fillText('✔', rx + block.width / 2, ry + block.height / 2 + 5);
        }
      } else if (block.type === 'spring') {
        const t = Date.now();
        const baseHeight = 10;
        const plateHeight = 8;
        
        ctx.save();
        
        // 1. Draw heavy dark metallic base plate (Bottom 10px)
        const baseY = ry + block.height - baseHeight;
        ctx.fillStyle = '#1e1e2d'; // Charcoal heavy steel
        ctx.fillRect(rx, baseY, block.width, baseHeight);
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(rx, baseY, block.width, baseHeight);
        
        // Draw diagonal hazard yellow-and-black stripes across the base plate
        ctx.fillStyle = '#facc15'; // Bright industrial safety yellow
        for (let sx = rx + 4; sx < rx + block.width; sx += 12) {
          ctx.beginPath();
          ctx.moveTo(sx, baseY);
          ctx.lineTo(sx + 6, baseY);
          ctx.lineTo(sx, baseY + baseHeight - 1);
          ctx.lineTo(sx - 6, baseY + baseHeight - 1);
          ctx.closePath();
          ctx.fill();
        }
        
        // 2. Draw Heavy 3D-Look Steel Coil Springs
        const springTopY = ry + plateHeight;
        const springBottomY = baseY;
        const springHeight = springBottomY - springTopY;
        
        ctx.strokeStyle = '#64748b'; // Sleek dark steel grey
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        
        const coilsCount = 4;
        ctx.moveTo(rx + block.width / 2, springBottomY);
        for (let i = 0; i <= coilsCount; i++) {
          const cy = springBottomY - (i / coilsCount) * springHeight;
          const cx = rx + block.width / 2 + (i % 2 === 0 ? -12 : 12);
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
        
        // Silver-chrome highlights down the spring steel center
        ctx.strokeStyle = '#cbd5e1'; // Brighter silver
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // 3. Draw active Temu-style Orange bouncing launching plate on top
        const plateY = ry;
        ctx.fillStyle = '#fb923c'; // Energetic orange launching color
        ctx.fillRect(rx + 2, plateY, block.width - 4, plateHeight);
        
        // Plate outer dark accent outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(rx + 2, plateY, block.width - 4, plateHeight);
        
        // Highlight layer on launch plate representing sleek modern casing
        ctx.fillStyle = '#ffedd5';
        ctx.fillRect(rx + 4, plateY + 1, block.width - 8, 2);
        
        // 4. Draw glowing arrows hovering above the launch plate pointing up (▲ ▲)
        const pulseAlpha = Math.sin(t / 120) * 0.4 + 0.6;
        ctx.fillStyle = `rgba(251, 146, 60, ${pulseAlpha})`;
        ctx.font = '900 11px "Outfit"';
        ctx.textAlign = 'center';
        ctx.fillText('▲', rx + block.width / 2 - 8, ry - 3);
        ctx.fillText('▲', rx + block.width / 2 + 8, ry - 3);
        
        ctx.restore();
      } else if (block.type === 'finish_flag') {
        // Tall majestic orange flagpole
        ctx.fillStyle = '#334155';
        ctx.fillRect(rx, ry, block.width, block.height);

        // Giant glowing banner on top
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        const flagY = ry + 20;
        ctx.moveTo(rx + block.width, flagY);
        ctx.lineTo(rx + block.width + 120, flagY + 30);
        ctx.lineTo(rx + block.width, flagY + 60);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px "Outfit"';
        ctx.textAlign = 'left';
        ctx.fillText('FREE SHIPPING 🏁', rx + block.width + 10, flagY + 36);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, block.width, block.height);
      }
    });

    // DRAW COINS
    world.coins.forEach((coin) => {
      if (coin.isCollected) return;
      if (coin.x + coin.width < cameraX || coin.x > cameraX + nativeWidth) return;

      const rx = coin.x - cameraX;
      // Pulse vertical offset for organic float
      const pulseY = coin.y + Math.sin(coin.pulseOffset) * 6;

      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#eab308';

      // Draw Gold Temu Stamp Medal
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(rx + coin.width / 2, pulseY + coin.height / 2, coin.width / 2, 0, Math.PI * 2);
      ctx.fill();

      // Shiny border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Inside stamp text
      ctx.fillStyle = '#000000';
      ctx.font = '900 13px "Outfit"';
      ctx.textAlign = 'center';
      ctx.fillText('%', rx + coin.width / 2, pulseY + coin.height / 2 + 4.5);
      ctx.restore();
    });

    // DRAW ENEMIES
    world.enemies.forEach((enemy) => {
      if (enemy.isDead) return;
      if (enemy.x + enemy.width < cameraX || enemy.x > cameraX + nativeWidth) return;

      const rx = enemy.x - cameraX;
      const ry = enemy.y;

      // Draw depending on custom enemy layout
      if (enemy.type === 'shipping_fee') {
        // A cute floating shipping package box with wings
        ctx.fillStyle = '#b45309'; // cardboard brown
        ctx.fillRect(rx, ry, enemy.width, enemy.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, enemy.width, enemy.height);

        // Custom taped layout
        ctx.fillStyle = '#eab308'; // golden Temu tape
        ctx.fillRect(rx + 6, ry + 1, 6, enemy.height - 2);
        ctx.fillRect(rx + 1, ry + 10, enemy.width - 2, 6);

        // Wings
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(rx - 5, ry + 12, 10, 5, -Math.PI / 6, 0, Math.PI * 2);
        ctx.ellipse(rx + enemy.width + 5, ry + 12, 10, 5, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label txt
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 8px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText('FEE', rx + enemy.width / 2, ry + 8);
      } else if (enemy.type === 'goomba') {
        // Draw cute brown mushroom Goomba!
        const ex = rx;
        const ey = ry;
        const ew = enemy.width;
        const eh = enemy.height;

        // Brown body dome
        ctx.fillStyle = '#92400e'; // Warm dark mushroom brown
        ctx.beginPath();
        ctx.moveTo(ex + ew / 2, ey);
        ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + eh * 0.6);
        ctx.quadraticCurveTo(ex + ew, ey + eh * 0.8, ex + ew * 0.8, ey + eh * 0.8);
        ctx.lineTo(ex + ew * 0.2, ey + eh * 0.8);
        ctx.quadraticCurveTo(ex, ey + eh * 0.8, ex, ey + eh * 0.6);
        ctx.quadraticCurveTo(ex, ey, ex + ew / 2, ey);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Cream face stem
        ctx.fillStyle = '#fef3c7'; // Cream beige
        ctx.beginPath();
        ctx.roundRect?.(ex + ew * 0.2, ey + eh * 0.5, ew * 0.6, eh * 0.4, 4);
        ctx.fill();
        ctx.stroke();

        // Small little dark feet
        ctx.fillStyle = '#1e293b'; // Dark slate feet
        ctx.beginPath();
        ctx.ellipse(ex + ew * 0.3, ey + eh - 2, 5, 3, 0, 0, Math.PI * 2);
        ctx.ellipse(ex + ew * 0.7, ey + eh - 2, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Anger slanted eyebrows
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        // Left eyebrow slanted
        ctx.moveTo(ex + ew * 0.25, ey + eh * 0.3);
        ctx.lineTo(ex + ew * 0.48, ey + eh * 0.45);
        ctx.lineTo(ex + ew * 0.48, ey + eh * 0.38);
        ctx.closePath();
        ctx.fill();

        // Right eyebrow slanted
        ctx.beginPath();
        ctx.moveTo(ex + ew * 0.75, ey + eh * 0.3);
        ctx.lineTo(ex + ew * 0.52, ey + eh * 0.45);
        ctx.lineTo(ex + ew * 0.52, ey + eh * 0.38);
        ctx.closePath();
        ctx.fill();

        // White eyes with black pupils
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ex + ew * 0.3, ey + eh * 0.45, 3, 5);
        ctx.fillRect(ex + ew * 0.6, ey + eh * 0.45, 3, 5);
        ctx.fillStyle = '#000000';
        ctx.fillRect(ex + ew * 0.3 + 1, ey + eh * 0.45 + 1, 1.5, 3);
        ctx.fillRect(ex + ew * 0.6 + 0.5, ey + eh * 0.45 + 1, 1.5, 3);
      } else if (enemy.type === 'refund_ghost') {
        // An purple refund customer ghost
        ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
        ctx.beginPath();
        ctx.arc(rx + enemy.width / 2, ry + 12, enemy.width / 2, Math.PI, 0, false);
        ctx.lineTo(rx + enemy.width, ry + enemy.height);
        // Wave pattern bottom
        const waveCount = 3;
        for (let i = 0; i < waveCount; i++) {
          const wX = rx + enemy.width - (i * enemy.width) / waveCount;
          ctx.lineTo(wX - enemy.width / waveCount / 2, ry + enemy.height - 6);
          ctx.lineTo(wX - (i + 1) * (enemy.width / waveCount), ry + enemy.height);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Angry yellow eyes
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(rx + 8, ry + 10, 2.5, 0, Math.PI * 2);
        ctx.arc(rx + enemy.width - 8, ry + 10, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText('환불요청', rx + 1, ry - 3);
      } else if (enemy.type === 'support_bot') {
        // High-bouncing chat speech bubble bot helper
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.roundRect?.(rx, ry, enemy.width, enemy.height - 6, 6);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Speech pointer bottom
        ctx.beginPath();
        ctx.moveTo(rx + 10, ry + enemy.height - 6);
        ctx.lineTo(rx + 15, ry + enemy.height);
        ctx.lineTo(rx + 20, ry + enemy.height - 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Active smiley chat bubble
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('💬', rx + enemy.width / 2, ry + 16);
      } else if (enemy.type === 'out_of_stock') {
        // Caution spike blocks "품절"
        ctx.fillStyle = '#ea5858';
        ctx.beginPath();
        ctx.moveTo(rx, ry + enemy.height);
        ctx.lineTo(rx + enemy.width / 4, ry);
        ctx.lineTo(rx + enemy.width / 2, ry + enemy.height);
        ctx.lineTo(rx + (3 * enemy.width) / 4, ry);
        ctx.lineTo(rx + enemy.width, ry + enemy.height);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('품절 대란', rx + enemy.width / 2, ry + enemy.height - 1);
      }
    });

    // DRAW MUSHROOMS
    world.mushrooms = world.mushrooms || [];
    world.mushrooms.forEach((mush) => {
      if (mush.isCollected) return;
      if (mush.x + mush.width < cameraX || mush.x > cameraX + nativeWidth) return;

      const rx = mush.x - cameraX;
      const ry = mush.y;

      ctx.save();
      // Cap
      ctx.fillStyle = mush.type === 'growth' ? '#a855f7' : '#eab308'; // Purple for growth, Gold/Yellow for speed
      ctx.beginPath();
      ctx.arc(rx + mush.width / 2, ry + 12, 12, Math.PI, 0, false);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Mushroom spots (Draw custom white spots on the cap)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx + mush.width / 2, ry + 4, 3, 0, Math.PI * 2);
      ctx.arc(rx + 5, ry + 10, 2.5, 0, Math.PI * 2);
      ctx.arc(rx + mush.width - 5, ry + 10, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Stem (Mushroom body)
      ctx.fillStyle = '#fef08a'; // custom cream body
      ctx.beginPath();
      ctx.roundRect?.(rx + 6, ry + 11, 13, 11, 3);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx + 6, ry + 11, 13, 11);

      // Cute tiny black eyes
      ctx.fillStyle = '#000000';
      ctx.fillRect(rx + 9, ry + 14, 2, 4);
      ctx.fillRect(rx + 14, ry + 14, 2, 4);

      ctx.restore();
    });

    // DRAW PLAYERS
    world.players.forEach((player) => {
      if (player.isDead) return;
      if (player.x + player.width < cameraX || player.x > cameraX + nativeWidth) return;

      const isGiant = player.powerup?.type === 'giant_foam' && player.powerup?.visualActive;
      const isMini = player.powerup?.type === 'mini_foam' && player.powerup?.visualActive;
      const isBuffSpeed = player.powerup?.type === 'speed_shoes' && player.powerup?.visualActive;

      // Extract accurate sizing using helper to support shrunken players symmetrically!
      const pSize = getPlayerSize(player);
      const pW = pSize.w;
      const pH = pSize.h;
      const rx = player.x - cameraX;
      const ry = player.y;

      // Invincible blinking effect
      const isInvincible = player.invincibleUntil && Date.now() < player.invincibleUntil;
      if (isInvincible && Math.floor(Date.now() / 80) % 2 === 0) {
        return;
      }

      // Custom motion trail for super speed boots or giant growth dust
      if (isBuffSpeed) {
        ctx.fillStyle = 'rgba(251, 146, 60, 0.25)';
        ctx.fillRect(rx - player.vx * 1.5, ry - player.vy * 1.5, pW, pH);
        ctx.fillRect(rx - player.vx * 2.5, ry - player.vy * 2.5, pW, pH);
      }

      // 1. Draw Character Avatar/Skin representation
      ctx.fillStyle = CHAR_COLORS[player.charType];
      ctx.beginPath();
      ctx.roundRect?.(rx, ry, pW, pH, 3);
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = player.id === localPlayerId ? 4 : 2;
      ctx.strokeRect(rx, ry, pW, pH);

      // 2. Draw Facing eyes depending on left/right movement (adjusted with math.max for mini size)
      ctx.fillStyle = '#000000';
      const eyeOffset = player.facingLeft ? Math.max(2, pW * 0.12) : pW - Math.max(9, pW * 0.38);
      const eyeSizeW = Math.max(2.5, pW * 0.09);
      const eyeSizeH = Math.max(3.5, pH * 0.11);
      const eyeYOffset = Math.max(8, pH * 0.24);

      ctx.fillRect(rx + eyeOffset, ry + eyeYOffset, eyeSizeW, eyeSizeH);
      ctx.fillRect(rx + eyeOffset + Math.max(4, pW * 0.15), ry + eyeYOffset, eyeSizeW, eyeSizeH);

      // Draw custom emblems on shirts (scaled beautifully)
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(7, pH * 0.28)}px "Outfit"`;
      ctx.textAlign = 'center';
      ctx.fillText(
        player.charType === 'buyer' ? '🛒' : player.charType === 'hunter' ? '🎟️' : player.charType === 'boxman' ? '📦' : '⚡',
        rx + pW / 2,
        ry + pH / 2 + Math.max(1.5, pH * 0.08)
      );

      // 3. Draw Power-up Shield Auroras (With clean neon glow)
      if (player.hasShield) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(rx + pW / 2, ry + pH / 2, Math.max(pW, pH) * 0.76, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. Draw Player labels / Name tags above head
      ctx.fillStyle = player.id === localPlayerId ? '#ffedd5' : '#e2e8f0';

      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';

      // Trim long names
      const displayTag = player.name.substring(0, 10);
      ctx.fillText(displayTag, rx + pW / 2, ry - 14);

      // Small crown icon on finished players
      if (player.isFinished) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px "Outfit"';
        ctx.fillText('🏆 완주', rx + pW / 2, ry - 28);
      }
    });

    // DRAW PARTICLES
    world.particles.forEach((part) => {
      ctx.fillStyle = part.color;
      ctx.font = `black ${Math.round(part.size)}px "Outfit"`;
      ctx.textAlign = 'center';
      
      ctx.save();
      ctx.globalAlpha = part.life;
      ctx.fillText(part.text, part.x - cameraX, part.y);
      ctx.restore();
    });

    // Flash bomb effects if targeted
    if (popupBombActive) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.fillRect(0, 0, nativeWidth, nativeHeight);
    }
  }

  // Visual helper reference mapper
  const CHAR_COLORS: Record<CharacterType, string> = {
    buyer: '#f97316',
    hunter: '#ef4444',
    boxman: '#3b82f6',
    runner: '#10b981',
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-white overflow-hidden">
      {/* Absolute Layer Container */}
      <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-white border-6 border-brutal-black overflow-hidden min-h-[480px]">
        <canvas ref={canvasRef} className="block w-full h-full object-contain" />
        
        {/* Modern Retro Game 3 2 1 START Countdown */}
        {startCountdown !== null && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/45 backdrop-blur-xs select-none pointer-events-none">
            <div className="flex flex-col items-center justify-center text-center animate-pulse">
              <div 
                className="text-[110px] sm:text-[130px] font-black italic tracking-wide text-neon-yellow drop-shadow-[5px_5px_0px_rgba(0,0,0,1)] select-none uppercase font-sans leading-none mb-4 animate-bounce"
                style={{
                  textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 8px 0 #ea580c'
                }}
              >
                {startCountdown === 0 ? 'START!' : startCountdown}
              </div>
              <div className="text-white text-xs sm:text-sm tracking-widest bg-brutal-black px-4 py-2 border-4 border-white font-extrabold shadow-[4px_4px_0px_rgba(234,88,12,1)] rounded-md">
                {startCountdown === 0 ? '🎰 쇼핑 레이스 시작!!' : '🛍️ 특가 줍기 1초 전...'}
              </div>
            </div>
          </div>
        )}

        {/* Extreme Popup Indicator */}
        {popupBombActive && (
          <div className="absolute inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none select-none">
            <div className="px-5 py-2.5 bg-red-650 border-4 border-brutal-black text-white font-black text-xs shadow-[4px_4px_0px_rgba(0,0,0,1)] animate-bounce flex items-center gap-2">
              ⚠️ 악성 마케팅 쿠폰 팝업 테러 공격 피격 중! ⚠️
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
