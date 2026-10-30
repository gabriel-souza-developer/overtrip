"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.visitController = void 0;
const index_js_1 = require("../services/index.js");
const index_js_2 = require("../validators/index.js");
exports.visitController = {
    async findAll(req, res) {
        const query = index_js_2.visitQuerySchema.parse(req.query);
        const result = await index_js_1.visitService.findAll(query);
        res.json(result);
    },
    async findById(req, res) {
        const { id } = req.params;
        const visit = await index_js_1.visitService.findById(id);
        res.json(visit);
    },
    async create(req, res) {
        const data = index_js_2.visitCreateSchema.parse(req.body);
        const visit = await index_js_1.visitService.create(data);
        res.status(201).json(visit);
    },
    async update(req, res) {
        const { id } = req.params;
        const data = index_js_2.visitUpdateSchema.parse(req.body);
        const visit = await index_js_1.visitService.update(id, data);
        res.json(visit);
    },
    async delete(req, res) {
        const { id } = req.params;
        const result = await index_js_1.visitService.delete(id);
        res.json(result);
    },
    async associateWithTrip(req, res) {
        const { id } = req.params;
        const { tripId } = req.body;
        // tripId can be null to disassociate
        const visit = await index_js_1.visitService.associateWithTrip(id, tripId || null);
        res.json(visit);
    },
};
//# sourceMappingURL=visitController.js.map