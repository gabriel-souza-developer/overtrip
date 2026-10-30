"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.galleryController = void 0;
const index_js_1 = require("../services/index.js");
const index_js_2 = require("../validators/index.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
exports.galleryController = {
    async findAll(req, res) {
        const query = index_js_2.galleryQuerySchema.parse(req.query);
        const result = await index_js_1.galleryService.findAll(query);
        res.json(result);
    },
    async findById(req, res) {
        const { id } = req.params;
        const entry = await index_js_1.galleryService.findById(id);
        res.json(entry);
    },
    async create(req, res) {
        const data = index_js_2.galleryCreateSchema.parse(req.body);
        const entry = await index_js_1.galleryService.create(data);
        res.status(201).json(entry);
    },
    async update(req, res) {
        const { id } = req.params;
        const data = index_js_2.galleryUpdateSchema.parse(req.body);
        const entry = await index_js_1.galleryService.update(id, data);
        res.json(entry);
    },
    async delete(req, res) {
        const { id } = req.params;
        const result = await index_js_1.galleryService.delete(id);
        res.json(result);
    },
    async reorder(req, res) {
        const { entries } = req.body;
        if (!Array.isArray(entries)) {
            throw errorHandler_js_1.AppError.badRequest('entries deve ser um array');
        }
        for (const entry of entries) {
            if (!entry.id || typeof entry.orderIndex !== 'number') {
                throw errorHandler_js_1.AppError.badRequest('Cada entry deve ter id e orderIndex');
            }
        }
        const result = await index_js_1.galleryService.reorder(entries);
        res.json(result);
    },
};
//# sourceMappingURL=galleryController.js.map