"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_js_1 = require("./config.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const authRoutes_js_1 = __importDefault(require("./routes/authRoutes.js"));
const tripRoutes_js_1 = __importDefault(require("./routes/tripRoutes.js"));
const visitRoutes_js_1 = __importDefault(require("./routes/visitRoutes.js"));
const galleryRoutes_js_1 = __importDefault(require("./routes/galleryRoutes.js"));
const dashboardRoutes_js_1 = __importDefault(require("./routes/dashboardRoutes.js"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: config_js_1.config.corsOrigin,
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API routes
app.use('/api/auth', authRoutes_js_1.default);
app.use('/api/trips', tripRoutes_js_1.default);
app.use('/api/visits', visitRoutes_js_1.default);
app.use('/api/gallery', galleryRoutes_js_1.default);
app.use('/api/dashboard', dashboardRoutes_js_1.default);
// Generate JSON endpoint (lazy loaded to avoid startup execution)
app.post('/api/generate-json', async (req, res, next) => {
    try {
        const { authenticate, authorize } = await import('./middleware/auth.js');
        // Apply auth middleware
        await new Promise((resolve, reject) => {
            authenticate(req, res, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        authorize('admin')(req, res, async (err) => {
            if (err)
                return next(err);
            try {
                // Use variable to avoid TypeScript resolving path at compile time
                const generateJsonPath = '../scripts/generate-json.js';
                const { generateJson } = await import(generateJsonPath);
                await generateJson();
                res.json({ success: true, message: 'JSONs gerados com sucesso' });
            }
            catch (error) {
                console.error('Generate JSON error:', error);
                res.status(500).json({ error: 'Erro ao gerar JSONs' });
            }
        });
    }
    catch (error) {
        next(error);
    }
});
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});
// Error handler (must be last)
app.use(errorHandler_js_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map