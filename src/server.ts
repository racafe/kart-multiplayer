import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

// ========================================
// TYPES
// ========================================

interface Room {
  code: string;
  host: WebSocket | null;
  player1: WebSocket | null;
  player2: WebSocket | null;
  createdAt: number;
}

interface IncomingMessage {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ========================================
// CONFIGURATION
// ========================================

const PORT = parseInt(process.env.PORT || "3000", 10);
const ROOM_CODE_LENGTH = 4;
const ROOM_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Characters for room codes (no ambiguous chars: 0/O, 1/I/L)
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ========================================
// STATE
// ========================================

const rooms = new Map<string, Room>();

// Map WebSocket -> { roomCode, clientType }
const clientInfo = new Map<
  WebSocket,
  { roomCode: string; clientType: "host" | "player1" | "player2" }
>();

// ========================================
// HELPERS
// ========================================

function generateRoomCode(): string {
  let code: string;
  do {
    code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(ws: WebSocket, message: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToPlayers(room: Room, message: Record<string, unknown>): void {
  if (room.player1) send(room.player1, message);
  if (room.player2) send(room.player2, message);
}

function broadcastToHost(room: Room, message: Record<string, unknown>): void {
  if (room.host) send(room.host, message);
}

function isRoomEmpty(room: Room): boolean {
  return !room.host && !room.player1 && !room.player2;
}

// ========================================
// MESSAGE HANDLERS
// ========================================

function handleCreateRoom(ws: WebSocket): void {
  const code = generateRoomCode();
  const room: Room = {
    code,
    host: ws,
    player1: null,
    player2: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  clientInfo.set(ws, { roomCode: code, clientType: "host" });

  send(ws, { type: "room_created", data: { roomCode: code } });
  console.log(`Room created: ${code}`);
}

function handleJoinRoom(ws: WebSocket, data: Record<string, unknown>): void {
  const roomCode = (data.roomCode as string)?.toUpperCase();
  if (!roomCode) {
    send(ws, { type: "error", data: { message: "Room code required" } });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    send(ws, {
      type: "error",
      data: { message: "Room not found or expired" },
    });
    return;
  }

  // Assign to first available player slot
  let playerSlot: "player1" | "player2";
  if (!room.player1) {
    room.player1 = ws;
    playerSlot = "player1";
  } else if (!room.player2) {
    room.player2 = ws;
    playerSlot = "player2";
  } else {
    send(ws, { type: "error", data: { message: "Room is full" } });
    return;
  }

  clientInfo.set(ws, { roomCode, clientType: playerSlot });

  // Notify the joining player
  send(ws, { type: "room_joined", data: { playerSlot, roomCode } });

  // Notify the host
  broadcastToHost(room, { type: `${playerSlot}_joined` });

  console.log(`${playerSlot} joined room ${roomCode}`);
}

function handleReconnect(ws: WebSocket, data: Record<string, unknown>): void {
  const roomCode = (data.roomCode as string)?.toUpperCase();
  const clientType = data.clientType as string;

  if (!roomCode || !clientType) {
    send(ws, {
      type: "error",
      data: { message: "Room code and client type required for reconnection" },
    });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    send(ws, {
      type: "error",
      data: { message: "Room not found or expired" },
    });
    return;
  }

  // Reassign the WebSocket to the appropriate slot
  if (clientType === "host") {
    room.host = ws;
  } else if (clientType === "player1") {
    room.player1 = ws;
  } else if (clientType === "player2") {
    room.player2 = ws;
  } else {
    send(ws, { type: "error", data: { message: "Invalid client type" } });
    return;
  }

  clientInfo.set(ws, {
    roomCode,
    clientType: clientType as "host" | "player1" | "player2",
  });

  // Notify the reconnecting client
  send(ws, {
    type: "reconnected",
    data: { playerSlot: clientType, roomCode },
  });

  // Notify the host about player reconnection
  if (clientType === "player1" || clientType === "player2") {
    broadcastToHost(room, { type: `${clientType}_reconnected` });
  }

  console.log(`${clientType} reconnected to room ${roomCode}`);
}

function handleDisconnect(ws: WebSocket): void {
  const info = clientInfo.get(ws);
  if (!info) return;

  const { roomCode, clientType } = info;
  const room = rooms.get(roomCode);
  clientInfo.delete(ws);

  if (!room) return;

  // Clear the slot
  if (clientType === "host") {
    room.host = null;
    // Notify players that host disconnected (room closed)
    broadcastToPlayers(room, { type: "room_closed" });
    // Clean up room when host leaves
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} closed (host disconnected)`);
    return;
  }

  if (clientType === "player1") {
    room.player1 = null;
    broadcastToHost(room, { type: "player1_disconnected" });
  } else if (clientType === "player2") {
    room.player2 = null;
    broadcastToHost(room, { type: "player2_disconnected" });
  }

  // Clean up empty rooms
  if (isRoomEmpty(room)) {
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} cleaned up (empty)`);
  }

  console.log(`${clientType} disconnected from room ${roomCode}`);
}

function handleGameMessage(
  ws: WebSocket,
  message: IncomingMessage,
): void {
  const info = clientInfo.get(ws);
  if (!info) return;

  const { roomCode, clientType } = info;
  const room = rooms.get(roomCode);
  if (!room) return;

  if (clientType === "host") {
    // Host sends to all players
    broadcastToPlayers(room, message as Record<string, unknown>);
  } else {
    // Player sends to host with player identifier
    broadcastToHost(room, {
      ...message,
      player: clientType,
    } as Record<string, unknown>);
  }
}

// ========================================
// SERVER SETUP
// ========================================

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server running");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (raw: Buffer) => {
    let message: IncomingMessage;
    try {
      message = JSON.parse(raw.toString()) as IncomingMessage;
    } catch {
      send(ws, { type: "error", data: { message: "Invalid JSON" } });
      return;
    }

    switch (message.type) {
      case "create_room":
        handleCreateRoom(ws);
        break;
      case "join_room":
        handleJoinRoom(ws, (message.data ?? {}) as Record<string, unknown>);
        break;
      case "reconnect":
        handleReconnect(ws, (message.data ?? {}) as Record<string, unknown>);
        break;

      // Kart game message types — forwarded between host and players
      case "steering_input":
      case "drift":
      case "item_use":
      case "game_state":
      case "race_start":
      case "race_starting":
      case "race_countdown":
      case "lap_update":
      case "race_finish":
      case "game_over":
      case "new_game":
      case "start_race":
        handleGameMessage(ws, message);
        break;

      default:
        // Forward any unknown message types too (extensible)
        handleGameMessage(ws, message);
        break;
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });

  ws.on("error", (err: Error) => {
    console.error("WebSocket error:", err.message);
    handleDisconnect(ws);
  });
});

// ========================================
// STALE ROOM CLEANUP
// ========================================

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_EXPIRY_MS && isRoomEmpty(room)) {
      rooms.delete(code);
      console.log(`Stale room ${code} cleaned up`);
    }
  }
}, CLEANUP_INTERVAL_MS);

// ========================================
// START
// ========================================

server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});
