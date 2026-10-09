import cors from "cors";
const allowedOrigins = globalThis.env?.allowedOrigins ?? [];
export const corsMiddleware = () => {
    return cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error("Not allowed by CORS"), false);
        },
        credentials: true,
        exposedHeaders: ["Content-Disposition", "Content-Type", "Content-Length"],
    });
};
