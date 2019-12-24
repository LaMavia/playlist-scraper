"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const DEFAULT_ENV = {
    BUTTON_FAIL: 15000,
    GOTO: 5000,
    REPEAT: false,
    SLOW_CRASH: 5000,
};
exports.load_env = () => {
    dotenv_1.default.config();
    // -------- Replace the missing env vars with the default ones -------- //
    for (const key in DEFAULT_ENV) {
        // @ts-ignore
        if (typeof process.env[key] == 'undefined')
            process.env[key] = DEFAULT_ENV[key];
        else
            switch (typeof DEFAULT_ENV[key]) {
                case 'number':
                    // @ts-ignore
                    process.env[key] = Number(process.env[key]);
                    break;
                case 'boolean':
                    // @ts-ignore
                    process.env[key] = Boolean(process.env[key]);
                    break;
            }
        console.log(`${key} = ${process.env[key]} [${typeof process.env[key]}]`);
    }
};
exports.bool = (key) => ['t', 'T', '1', 'true', 'True', 'Yes', 'y', 'yep', 'si'].includes(process.env[key] || DEFAULT_ENV[key]);
exports.num = (key) => +(process.env[key] || DEFAULT_ENV[key]);
