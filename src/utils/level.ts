import { BlockState, EnemyState, CoinState, GameWorld, PlayerState } from '../types';

export function createInitialWorld(): GameWorld {
  const levelWidth = 4800;
  const levelHeight = 600;
  const groundY = 520;

  const blocks: BlockState[] = [];
  const coins: CoinState[] = [];
  const enemies: EnemyState[] = [];

  // 1. Create Ground Pieces with Pits
  // We make gaps in the ground to make jumping fun!
  let currentX = 0;
  let blockIdCounter = 0;

  const groundSegments = [
    { start: 0, end: 800 },
    { start: 950, end: 1600 },
    { start: 1750, end: 2400 },
    { start: 2550, end: 3200 },
    { start: 3350, end: 4200 },
    { start: 4200, end: 4800 }, // finish platform
  ];

  groundSegments.forEach((seg, index) => {
    // Ground rectangles
    blocks.push({
      id: `ground-${index}`,
      x: seg.start,
      y: groundY,
      width: seg.end - seg.start,
      height: 80,
      type: 'ground',
      isHit: false,
    });
  });

  // 2. Generate Blocks (Bricks and Temu Boxes)
  const blockPlacements = [
    // Section 1 (0 - 800)
    { x: 300, y: 380, type: 'brick' as const },
    { x: 340, y: 380, type: 'temu_box' as const, containsItem: 'coin' as const },
    { x: 380, y: 380, type: 'brick' as const },
    { x: 420, y: 380, type: 'coupon_block' as const },
    { x: 460, y: 380, type: 'temu_box' as const, containsItem: 'mini_foam' as const },
    { x: 380, y: 240, type: 'temu_box' as const, containsItem: 'lightning_shield' as const },

    // Near the first pit (spring element to save players)
    { x: 740, y: groundY - 20, type: 'spring' as const },

    // Section 2 (950 - 1600)
    { x: 1050, y: 400, type: 'brick' as const },
    { x: 1090, y: 400, type: 'temu_box' as const, containsItem: 'coin' as const },
    { x: 1130, y: 400, type: 'brick' as const },
    { x: 1250, y: 300, type: 'coupon_block' as const },
    { x: 1290, y: 300, type: 'coupon_block' as const },
    { x: 1330, y: 300, type: 'temu_box' as const, containsItem: 'giant_foam' as const },
    // Intermediary safe landing steps to avoid falling directly on the spikes at 1420
    { x: 1370, y: 420, type: 'brick' as const },
    { x: 1410, y: 460, type: 'brick' as const },
    
    // High floating platforms
    { x: 1450, y: 220, type: 'brick' as const },
    { x: 1490, y: 220, type: 'brick' as const },
    { x: 1530, y: 220, type: 'brick' as const },

    // Section 3 (1750 - 2400) - The Challenge
    { x: 1800, y: 420, type: 'brick' as const },
    { x: 1840, y: 420, type: 'temu_box' as const, containsItem: 'coin' as const },
    { x: 1880, y: 420, type: 'brick' as const },
    { x: 1980, y: 300, type: 'temu_box' as const, containsItem: 'popup_attack' as const },
    { x: 2020, y: 300, type: 'brick' as const },
    { x: 2060, y: 300, type: 'temu_box' as const, containsItem: 'coin' as const },
    { x: 2200, y: 380, type: 'coupon_block' as const },
    { x: 2240, y: 380, type: 'spring' as const },
    { x: 2350, y: 260, type: 'brick' as const },

    // Section 4 (2550 - 3200) - Maze/Obstacle
    { x: 2600, y: 400, type: 'temu_box' as const, containsItem: 'speed_shoes' as const },
    { x: 2640, y: 400, type: 'brick' as const },
    { x: 2680, y: 400, type: 'coupon_block' as const },
    // Introduce safe bridge stepping stones to connect 2680 stack and 2780 stack over spikes
    { x: 2720, y: 400, type: 'brick' as const },
    { x: 2760, y: 400, type: 'brick' as const },
    { x: 2800, y: 420, type: 'brick' as const },
    
    { x: 2780, y: 280, type: 'brick' as const },
    { x: 2820, y: 280, type: 'temu_box' as const, containsItem: 'giant_foam' as const },
    { x: 2860, y: 280, type: 'temu_box' as const, containsItem: 'mini_foam' as const },
    
    // Low obstacles
    { x: 2950, y: 480, type: 'brick' as const },
    { x: 2990, y: 440, type: 'brick' as const },
    { x: 3030, y: 400, type: 'brick' as const },
    { x: 3070, y: 440, type: 'brick' as const }, // Step back down safely
    { x: 3110, y: groundY - 20, type: 'spring' as const },

    // Section 5 (3350 - 4200) - Speed run Section
    { x: 3450, y: 380, type: 'temu_box' as const, containsItem: 'coin' as const },
    { x: 3490, y: 380, type: 'coupon_block' as const },
    { x: 3530, y: 380, type: 'temu_box' as const, containsItem: 'lightning_shield' as const },
    // Intermediary safe landing steps to avoid falling directly on spikes at 3630
    { x: 3570, y: 430, type: 'brick' as const },
    { x: 3680, y: 280, type: 'brick' as const },
    { x: 3720, y: 280, type: 'temu_box' as const, containsItem: 'coin' as const },
    { x: 3760, y: 280, type: 'brick' as const },
    { x: 3820, y: 180, type: 'brick' as const },
    { x: 3860, y: 180, type: 'coupon_block' as const },
    { x: 3900, y: 180, type: 'brick' as const },
    { x: 4050, y: 350, type: 'brick' as const },
    { x: 4090, y: 350, type: 'temu_box' as const, containsItem: 'speed_shoes' as const },
    { x: 4130, y: 350, type: 'brick' as const },
  ];

  blockPlacements.forEach((bp, index) => {
    blocks.push({
      id: `block-${index}`,
      x: bp.x,
      y: bp.y,
      width: 40,
      height: 40,
      type: bp.type,
      isHit: false,
      containsItem: (bp as any).containsItem || undefined,
    });
  });

  // Finish Flagpole
  blocks.push({
    id: 'finish-pole',
    x: 4500,
    y: groundY - 320,
    width: 20,
    height: 320,
    type: 'finish_flag',
    isHit: false,
  });

  // 3. Generate Coins
  const coinCoords = [
    { x: 200, y: 480 }, { x: 240, y: 460 }, { x: 280, y: 480 },
    { x: 340, y: 300 }, { x: 380, y: 180 }, { x: 460, y: 300 },
    { x: 600, y: 420 }, { x: 640, y: 400 }, { x: 680, y: 420 },
    
    { x: 1000, y: 470 }, { x: 1150, y: 480 },
    { x: 1250, y: 240 }, { x: 1290, y: 245 }, { x: 1330, y: 240 },
    { x: 1470, y: 480 }, { x: 1510, y: 480 },
    
    { x: 1820, y: 480 }, { x: 1840, y: 360 }, { x: 1860, y: 480 },
    { x: 2100, y: 350 }, { x: 2140, y: 320 }, { x: 2180, y: 350 },
    
    { x: 2570, y: 480 }, { x: 2610, y: 480 },
    { x: 2780, y: 220 }, { x: 2820, y: 220 }, { x: 2860, y: 220 },
    { x: 3100, y: 320 }, { x: 3140, y: 300 },
    
    { x: 3400, y: 480 }, { x: 3450, y: 320 }, { x: 3500, y: 480 },
    { x: 3680, y: 220 }, { x: 3720, y: 220 }, { x: 3760, y: 220 },
    { x: 3950, y: 300 }, { x: 4000, y: 300 },
    
    { x: 4300, y: 480 }, { x: 4350, y: 480 }, { x: 4400, y: 480 },
  ];

  coinCoords.forEach((cc, index) => {
    coins.push({
      id: `coin-${index}`,
      x: cc.x,
      y: cc.y,
      width: 25,
      height: 25,
      isCollected: false,
      value: 10,
      pulseOffset: Math.random() * Math.PI,
    });
  });

  // 4. Spawn Enemies
  const enemyPlacements = [
    // Standard Goombas (moves side-to-side on ground, stompable and respawning)
    { x: 300, y: groundY - 32, type: 'goomba' as const },
    { x: 600, y: groundY - 32, type: 'goomba' as const },
    { x: 1150, y: groundY - 32, type: 'goomba' as const },
    { x: 1550, y: groundY - 32, type: 'goomba' as const },
    { x: 2100, y: groundY - 32, type: 'goomba' as const },
    { x: 2500, y: groundY - 32, type: 'goomba' as const },
    { x: 3500, y: groundY - 32, type: 'goomba' as const },
    { x: 4180, y: groundY - 32, type: 'goomba' as const },

    // Refund Ghost (floats at medium height)
    { x: 1300, y: 240, type: 'refund_ghost' as const },
    { x: 2300, y: 180, type: 'refund_ghost' as const },
    
    // Support Bot (high bouncing speech bubble)
    { x: 2050, y: groundY - 35, type: 'support_bot' as const },
    { x: 3000, y: groundY - 35, type: 'support_bot' as const },

    // Ultimate barrier before flagpole
    { x: 4300, y: 380, type: 'refund_ghost' as const },
  ];

  enemyPlacements.forEach((ep, index) => {
    let width = 32;
    let height = 32;
    let vy = 0;
    if ((ep.type as string) === 'out_of_stock') {
      width = 44;
      height = 14;
    } else if (ep.type === 'support_bot') {
      width = 30;
      height = 30;
      vy = -4; // starts bouncing
    }

    enemies.push({
      id: `enemy-${index}`,
      x: ep.x,
      y: ep.y,
      vx: ((ep.type as string) === 'shipping_fee' || ep.type === 'goomba') ? -1.2 : ep.type === 'refund_ghost' ? -1 : 0,
      vy,
      width,
      height,
      type: ep.type,
      isDead: false,
      animationFrame: 0,
      spawnX: ep.x,
      spawnY: ep.y,
    });
  });

  return {
    players: [],
    blocks,
    enemies,
    coins,
    particles: [],
    mushrooms: [],
    levelWidth,
    levelHeight,
    gravity: 0.6,
    timeRemaining: 60, // 60 seconds (1 minute limit)
    isStarted: false,
    isFinished: false,
  };
}

// Bot AI helper function: decides movement based on bot's coordinates and nearest obstacles/coins
export function updateBotAI(bot: PlayerState, world: GameWorld): Record<string, boolean> {
  const inputs: Record<string, boolean> = { ArrowLeft: false, ArrowRight: false, ArrowUp: false };

  if (bot.isDead || bot.isFinished) {
    return inputs;
  }

  // Find nearest coin or finish pole forward
  let targetX = 4500; // default flag pole x
  const activeCoins = world.coins.filter((c) => !c.isCollected && c.x > bot.x);
  
  if (activeCoins.length > 0) {
    // find nearest coin in front
    const nearestCoin = activeCoins.reduce((prev, curr) => (curr.x - bot.x < prev.x - bot.x ? curr : prev), activeCoins[0]);
    targetX = nearestCoin.x;
  }

  // Primary direction: move towards target
  if (bot.x < targetX) {
    inputs.ArrowRight = true;
  } else if (bot.x > targetX + 50) {
    inputs.ArrowLeft = true;
  }

  // Secondary Logic: Jump over gaps!
  // Look ahead for a pit/gap in the blocks.
  const nextX = bot.x + (bot.facingLeft ? -40 : 40);
  let isBlockUnderNext = false;
  
  world.blocks.forEach((b) => {
    if (b.type === 'ground' || b.type === 'brick') {
      if (nextX >= b.x && nextX <= b.x + b.width && b.y >= bot.y + bot.height - 10 && b.y <= bot.y + bot.height + 40) {
        isBlockUnderNext = true;
      }
    }
  });

  // Jump if no block ahead (a pit) or if there is a wall (block at same y height as bot)
  let isWallAhead = false;
  world.blocks.forEach((b) => {
    if (b.type === 'brick' || b.type === 'temu_box' || b.type === 'coupon_block') {
      const dist = Math.abs(b.x - bot.x);
      if (dist < 60 && b.y < bot.y + bot.height && b.y > bot.y - 20) {
        isWallAhead = true;
      }
    }
  });

  // Jump of near an active enemy
  let isEnemyAhead = false;
  world.enemies.forEach((e) => {
    if (!e.isDead) {
      const dist = e.x - bot.x;
      if (dist > 0 && dist < 120 && Math.abs(e.y - bot.y) < 50) {
        isEnemyAhead = true;
      }
    }
  });

  if ((!isBlockUnderNext || isWallAhead || isEnemyAhead) && bot.isGrounded && Math.random() < 0.2) {
    inputs.ArrowUp = true;
  }

  return inputs;
}
