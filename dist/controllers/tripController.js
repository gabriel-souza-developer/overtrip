"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tripController = void 0;
const index_js_1 = require("../services/index.js");
const index_js_2 = require("../validators/index.js");
exports.tripController = {
    async findAll(req, res) {
        const query = index_js_2.tripQuerySchema.parse(req.query);
        const result = await index_js_1.tripService.findAll(query);
        res.json(result);
    },
    async findById(req, res) {
        const { id } = req.params;
        const trip = await index_js_1.tripService.findById(id);
        res.json(trip);
    },
    async create(req, res) {
        const data = index_js_2.tripCreateSchema.parse(req.body);
        const trip = await index_js_1.tripService.create(data);
        res.status(201).json(trip);
    },
    async update(req, res) {
        const { id } = req.params;
        const data = index_js_2.tripUpdateSchema.parse(req.body);
        const trip = await index_js_1.tripService.update(id, data);
        res.json(trip);
    },
    async delete(req, res) {
        const { id } = req.params;
        const result = await index_js_1.tripService.delete(id);
        res.json(result);
    },
    async publish(req, res) {
        const { id } = req.params;
        const trip = await index_js_1.tripService.publish(id);
        res.json(trip);
    },
    async unpublish(req, res) {
        const { id } = req.params;
        const trip = await index_js_1.tripService.unpublish(id);
        res.json(trip);
    },
};
//# sourceMappingURL=tripController.js.map