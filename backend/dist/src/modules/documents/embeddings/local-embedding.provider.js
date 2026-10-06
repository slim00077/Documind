"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalEmbeddingProvider = void 0;
const common_1 = require("@nestjs/common");
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const DIMENSIONS = 384;
/**
 * Runs a small sentence-embedding model fully locally via ONNX (no API key,
 * no network calls after the model is first downloaded and cached). This is
 * the default provider so the pipeline works out of the box in development.
 */
let LocalEmbeddingProvider = class LocalEmbeddingProvider {
    providerName = "local";
    modelName = MODEL_NAME;
    dimensions = DIMENSIONS;
    pipelinePromise = null;
    async embed(texts) {
        if (texts.length === 0) {
            return [];
        }
        const extractor = await this.getPipeline();
        const output = await extractor(texts, { pooling: "mean", normalize: true });
        const flat = Array.from(output.data);
        const [batchSize, dims] = output.dims;
        const vectors = [];
        for (let i = 0; i < batchSize; i++) {
            vectors.push(flat.slice(i * dims, (i + 1) * dims));
        }
        return vectors;
    }
    getPipeline() {
        if (!this.pipelinePromise) {
            this.pipelinePromise = Promise.resolve().then(() => __importStar(require("@huggingface/transformers"))).then(({ pipeline }) => pipeline("feature-extraction", MODEL_NAME));
        }
        return this.pipelinePromise;
    }
};
exports.LocalEmbeddingProvider = LocalEmbeddingProvider;
exports.LocalEmbeddingProvider = LocalEmbeddingProvider = __decorate([
    (0, common_1.Injectable)()
], LocalEmbeddingProvider);
