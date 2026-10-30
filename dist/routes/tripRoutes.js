"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tripController_js_1 = require("../controllers/tripController.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// All trip routes require authentication
router.use(auth_js_1.authenticate);
// Public read access for published trips could be added here
// For now, all routes require auth
router.get('/', tripController_js_1.tripController.findAll);
router.get('/:id', tripController_js_1.tripController.findById);
router.post('/', tripController_js_1.tripController.create);
router.put('/:id', tripController_js_1.tripController.update);
router.delete('/:id', tripController_js_1.tripController.delete);
router.post('/:id/publish', tripController_js_1.tripController.publish);
router.post('/:id/unpublish', tripController_js_1.tripController.unpublish);
exports.default = router;
//# sourceMappingURL=tripRoutes.js.map