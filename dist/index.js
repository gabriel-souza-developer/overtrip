"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_js_1 = require("./config.js");
const app_js_1 = __importDefault(require("./app.js"));
const server = app_js_1.default.listen(config_js_1.config.port, () => {
    console.log(`🚀 OVERTRIP API running on port ${config_js_1.config.port}`);
    console.log(`   Environment: ${config_js_1.config.nodeEnv}`);
    console.log(`   Health check: http://localhost:${config_js_1.config.port}/health`);
});
// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
//# sourceMappingURL=index.js.map