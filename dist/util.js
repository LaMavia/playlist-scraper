"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./env");
exports.wait = (ms) => new Promise(res => setTimeout(res, ms));
exports.click = (page, selector, rej) => page
    .waitForSelector(selector, {
    timeout: env_1.num("GOTO"),
})
    .then(() => page.click(selector))
    .catch(_ => rej && rej());
// -------- Returns `false` if failed to go to the url -------- //
exports.keep_going = (page, url, toleration) => new Promise(async (res, rej) => {
    const wait_until = 'load', timeout = 5000;
    let fine = false;
    let i = 0;
    while (!fine) {
        fine = await page
            .goto(url, {
            timeout,
            waitUntil: wait_until,
        })
            .then(_ => true)
            .catch(_ => {
            !page.isClosed() &&
                page.reload({
                    timeout,
                    waitUntil: wait_until,
                });
            return false;
        });
        if (++i > toleration)
            rej(new Error("Page ain't loading"));
    }
    res(false);
});
exports.log = (i, t, ui) => (msg) => ui.updateBottomBar(`[${i}/${t}] ${msg}`);
