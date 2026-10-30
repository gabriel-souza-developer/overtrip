"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const galleryController_js_1 = require("../controllers/galleryController.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate);
router.get('/', galleryController_js_1.galleryController.findAll);
router.get('/:id', galleryController_js_1.galleryController.findById);
router.post('/', galleryController_js_1.galleryController.create);
router.put('/:id', galleryController_js_1.galleryController.update);
router.delete('/:id', galleryController_js_1.galleryController.delete);
router.post('/reorder', galleryController_js_1.galleryController.reorder);
exports.default = router;
//# sourceMappingURL=galleryRoutes.js.map