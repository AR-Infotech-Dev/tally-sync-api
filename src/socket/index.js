import { Server } from "socket.io";
import { SOCKET_EVENTS } from "./utils/events.js";
import { connectorRoom, userRoom } from "./utils/rooms.js";
import { registerConnectorSocketHandlers } from "../modules/connectors/connector.socket.js";
let io = null;
export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.info("Socket connected:", socket.id);
        registerConnectorSocketHandlers(socket);
        socket.on("disconnect", (reason) => {
            console.info("Socket disconnected:", socket.id, reason);
        });
    });
    console.info("Socket Initialized");
};
export const getIO = () => {
    if (!io) { throw new Error("Socket not initialized"); }
    return io;
};

export const emit = (userId, event = "new_notification", payload = {}) => {
    try {
        if (!io || !userId) return;
        io.to(userRoom(userId)).emit(event, payload);
    } catch (error) {
        console.error("Socket Emit Error :", error.message);
    }
};

export const emitToConnector = (clientId, event, payload = {}) => {
    if (!io || !clientId || !event) return false;
    const roomName = connectorRoom(clientId);
    if (!io.sockets.adapter.rooms.get(roomName)?.size) return false;
    io.to(roomName).emit(event, payload);
    return true;
};
