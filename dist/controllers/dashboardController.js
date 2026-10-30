"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = void 0;
const index_js_1 = require("../services/index.js");
exports.dashboardController = {
    async getStats(req, res) {
        const stats = await index_js_1.dashboardService.getStats();
        res.json(stats);
    },
};
//# sourceMappingURL=dashboardController.js.map