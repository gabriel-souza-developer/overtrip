"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_js_1 = require("../controllers/authController.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// Public routes
router.post('/login', authController_js_1.authController.login);
// Protected routes
router.get('/me', auth_js_1.authenticate, authController_js_1.authController.me);
router.post('/change-password', auth_js_1.authenticate, authController_js_1.authController.changePassword);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map