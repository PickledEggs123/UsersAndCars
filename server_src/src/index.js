"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var app = express_1.default();
app.listen(3001, function () {
    console.log("listening on 3001...");
});
app.get("/", function (req, res) {
    res.json({
        message: "Hello World",
        time: new Date().toISOString()
    });
});
