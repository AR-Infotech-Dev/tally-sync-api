import cors from "cors";
import { env } from "../config/env.js";

const normalizeOrigin = (value) => {
    try {
        return new URL(value).origin;
    } catch {
        return String(value || "").replace(/\/+$/, "");
    }
};

const allowedOrigins = new Set(
    [...env.allowedOrigins, env.appUrl]
        .filter(Boolean)
        .map(normalizeOrigin)
);

export const corsMiddleware = () => {
    return cors((req, callback) => {
        const origin = req.get("origin");
        let originAllowed = !origin || allowedOrigins.has(normalizeOrigin(origin));

        // The Admin Console is served by this same Express app. Allow its
        // same-origin requests even when APP_URL has not been configured.
        if (!originAllowed && origin) {
            try {
                const parsedOrigin = new URL(origin);
                const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
                const requestProtocol = forwardedProtocol || req.protocol;
                originAllowed = ["http:", "https:"].includes(parsedOrigin.protocol)
                    && parsedOrigin.host.toLowerCase() === req.get("host")?.toLowerCase()
                    && parsedOrigin.protocol === `${requestProtocol}:`;
            } catch {
                originAllowed = false;
            }
        }

        if (!originAllowed) return callback(new Error("Not allowed by CORS"));
        return callback(null, {
            origin: true,
            credentials: true,
            exposedHeaders: ["Content-Disposition", "Content-Type", "Content-Length"],
        });
    });
};
