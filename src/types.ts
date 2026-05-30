export type CharacterType = 'buyer' | 'hunter' | 'boxman' | 'runner';

export interface CharacterInfo {
  id: CharacterType;
  name: string;
  koreanName: string;
  description: string;
  color: string;
  icon: string;
  baseSpeed: number;
  baseJump: number;
  perk: string;
}

export const CHARACTERS: Record<CharacterType, CharacterInfo> = {
  buyer: {
    id: 'buyer',
    name: 'Giga Buyer',
    koreanName: '대량 구매마 (기가바이어)',
    description: '박스째로 물건을 담아가며 무게감 있는 점프를 합니다. 체력이 강합니다.',
    color: '#ff6600',
    icon: '🛒',
    baseSpeed: 4.5,
    baseJump: 12.5,
    perk: '돈벼락 (코인 획득 시 추가 10% 속도 버프)',
  },
  hunter: {
    id: 'hunter',
    name: 'Coupon Hunter',
    koreanName: '할인 쿠폰 사냥꾼',
    description: '할인 쿠폰을 가로채기 위해 높은 기동성을 가지고 날렵하게 점프합니다.',
    color: '#ee431e',
    icon: '🎟️',
    baseSpeed: 5.0,
    baseJump: 14.5,
    perk: '쿠폰 센서 (쿠폰 아이템 자석 효과)',
  },
  boxman: {
    id: 'boxman',
    name: 'Temu Box Man',
    koreanName: '테무 배송 박스맨',
    description: '테무 배송 박스를 뒤집어쓴 의문의 영웅. 충돌 저항이 높습니다.',
    color: '#3b82f6',
    icon: '📦',
    baseSpeed: 4.2,
    baseJump: 13.0,
    perk: '배송 보호막 (적 해로운 효과 1회 반사/방어)',
  },
  runner: {
    id: 'runner',
    name: '99% Off Runner',
    koreanName: '99.9% 할인 런어웨이',
    description: '0.1초의 번개 딜 소식을 듣고 비정상적으로 빠르게 질주합니다.',
    color: '#10b981',
    icon: '⚡',
    baseSpeed: 6.2,
    baseJump: 11.5,
    perk: '초특가 질주 (기본 이속 최상, 돌발 브레이크 오작동 확률 5%)',
  },
};

export type GameMode = 'SOLO' | 'LOCAL_VERSUS' | 'ONLINE_P2P';

export interface PlayerState {
  id: string; // socket id, 'local-1', 'local-2', or 'bot'
  name: string;
  charType: CharacterType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isGrounded: boolean;
  score: number;
  lives: number;
  couponCount: number;
  isDead: boolean;
  isFinished: boolean;
  finishTime?: number;
  finishRank?: number;
  facingLeft: boolean;
  // Active Power-ups:
  powerup?: {
    type: 'speed_shoes' | 'giant_foam' | 'lightning_shield' | 'popup_attack' | 'mini_foam';
    expiresAt: number;
    visualActive: boolean;
  };
  hasShield: boolean;
  invincibleUntil?: number;
}

export interface BlockState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'ground' | 'brick' | 'temu_box' | 'coupon_block' | 'spring' | 'finish_flag';
  isHit: boolean;
  containsItem?: 'coin' | 'speed_shoes' | 'giant_foam' | 'lightning_shield' | 'popup_attack' | 'coupon_banner' | 'mini_foam';
}

export interface EnemyState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  type: 'shipping_fee' | 'refund_ghost' | 'support_bot' | 'out_of_stock' | 'goomba';
  isDead: boolean;
  animationFrame: number;
  deadTimer?: number;
  spawnX?: number;
  spawnY?: number;
}

export interface CoinState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isCollected: boolean;
  value: number;
  pulseOffset: number;
}

export interface ItemParticle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  color: string;
  life: number; // 0 to 1
  size: number;
}

export interface MushroomState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  type: 'growth' | 'speed';
  isCollected: boolean;
}

export interface GameWorld {
  players: PlayerState[];
  blocks: BlockState[];
  enemies: EnemyState[];
  coins: CoinState[];
  particles: ItemParticle[];
  mushrooms?: MushroomState[];
  levelWidth: number;
  levelHeight: number;
  gravity: number;
  timeRemaining: number;
  isStarted: boolean;
  isFinished: boolean;
}

// WebSocket Protocols
export type WSMessage =
  | { type: 'CLIENT_CONNECT'; payload: { name: string; charType: CharacterType } }
  | { type: 'LEAVE_ROOM' }
  | { type: 'PLAYER_INPUT'; payload: { keys: Record<string, boolean>; x: number; y: number; vx: number; vy: number; facingLeft: boolean } }
  | { type: 'TRIGGER_WHEEL'; payload: { playerId: string } }
  | { type: 'SPIN_WHEEL_RESULT'; payload: { playerId: string; item: string; title: string; desc: string } }
  | { type: 'REQUEST_ROOM'; payload: { name: string; charType: CharacterType; roomCode: string } }
  | { type: 'SYNC_GAME_STATE'; payload: { player: PlayerState; blockHitId?: string; coinGrabId?: string; enemyKillId?: string; playerDie?: boolean; remoteStompedId?: string } }
  | { type: 'HOST_START_GAME' }
  | { type: 'ROOM_CREATED'; payload: { roomCode: string; participants: { id: string; name: string; charType: CharacterType; ready: boolean }[] } }
  | { type: 'ROOM_UPDATE'; payload: { roomCode: string; participants: { id: string; name: string; charType: CharacterType; ready: boolean }[]; isStarted: boolean } }
  | { type: 'ROOM_JOIN_ERROR'; payload: { message: string } }
  | { type: 'PEER_SYNC'; payload: { senderId: string; players: PlayerState[]; blockHits: string[]; coinGrabs: string[]; enemyKills: string[] } }
  | { type: 'CHAT_MSG'; payload: { senderName: string; text: string; color: string } }
  | { type: 'POPUP_BOMB'; payload: { targetId: string; popupType: string } };
