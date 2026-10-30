"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const visitController_js_1 = require("../controllers/visitController.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate);
router.get('/', visitController_js_1.visitController.findAll);
router.get('/:id', visitController_js_1.visitController.findById);
router.post('/', visitController_js_1.visitController.create);
router.put('/:id', visitController_js_1.visitController.update);
router.delete('/:id', visitController_js_1.visitController.delete);
router.post('/:id/associate', visitController_js_1.visitController.associateWithTrip);
exports.default = router;
//# sourceMappingURL=visitRoutes.js.map