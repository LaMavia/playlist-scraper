"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = require("path");
const util_1 = require("./util");
const timers_1 = require("timers");
const env_1 = require("./env");
const watch_id_rex = /v=([-_\w]+)/i;
const get_id = (t) => {
    const matches = t.url.match(watch_id_rex);
    if (!matches)
        throw new Error(`Error matching "${t.url}" for id`);
    return matches[1];
};
// @ts-ignore
exports.download = async (track, out, browser, ui, index, total) => new Promise(async (res, rej) => {
    const log = util_1.log(index, total, ui);
    const page = await browser.newPage();
    page.on('dialog', d => d.dismiss());
    let errorGoing = await util_1.keep_going(page, `https://2conv.com/`, 5).catch(() => true);
    if (errorGoing)
        return rej(true);
    const download_path = path_1.resolve(out, `${track.name.replace(/[\\\/]/gi, '')}.mp3`);
    await page
        .waitForSelector('#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input')
        .catch(rej);
    await page.type('#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input', track.url, {
        delay: 5,
    });
    log('Have just typed-in the url');
    await util_1.click(page, '#layout > header > div.container.header__container > div.convert-form > div.container > div:nth-child(2) > div > button');
    log('Clicked the "Process" button');
    const buttonFailTimeout = setTimeout(rej, env_1.num('BUTTON_FAIL'));
    await page.setRequestInterception(true);
    page
        .on('request', async (e) => {
        if (e.url().match(/\.mp3/i)) {
            await e.abort('blockedbyclient');
            clearTimeout(buttonFailTimeout);
            timers_1.clearInterval(downloadClicker);
            axios_1.default({
                url: e.url(),
                method: 'GET',
                responseType: 'stream',
            })
                .then(r => {
                log(`Downloading ${track.name}`);
                const dist = fs_extra_1.default.createWriteStream(path_1.resolve(download_path), {
                    encoding: 'utf-8',
                });
                const totalSize = +r.headers['content-length'];
                let downloadedSize = 0;
                let slow_crash = setTimeout(() => {
                    fs_extra_1.default.removeSync(download_path);
                    r.data.destroy();
                    dist.destroy();
                    rej(true);
                }, env_1.num('SLOW_CRASH'));
                r.data.on('close', async () => {
                    !page.isClosed() &&
                        (await page
                            .close()
                            .then(res)
                            .catch(async (e) => {
                            if (/closeTarget/gi.test(String(e)))
                                return;
                            log(`Error while downloading: ${e}`);
                            await util_1.wait(2000);
                            console.log('🐱');
                        })
                            .finally(() => clearTimeout(slow_crash)));
                });
                r.data.on('data', (c) => {
                    downloadedSize += c.length;
                    // -------- Refress iff is a major download -------- //
                    if (c.length / totalSize > 0.00001)
                        slow_crash.refresh();
                    log(`${track.name} [${((downloadedSize / totalSize) *
                        100).toFixed(2)}%]`);
                });
                // -------- Check for the integrity of the download -------- //
                dist.on('close', () => {
                    dist.cork();
                    downloadedSize == totalSize
                        ? res()
                        : (fs_extra_1.default.removeSync(download_path), rej(true));
                });
                return r.data.pipe(dist);
            })
                .catch(rej);
        }
        else
            e.continue();
    })
        .on('response', async (e) => {
        if (e.url().match(/\.mp3/i) && !e.ok()) {
            log(`Failed to download ${track.name}`);
            await util_1.wait(500);
            rej(false);
        }
    })
        .on('error', e => {
        console.log(`Page Error: ${e.message}`);
        return page.reload();
    });
    const downloadClicker = setInterval(async () => {
        await util_1.click(page, '#layout > header > div.container.header__container > div.convert-form > div > div.download__buttons > button');
    }, env_1.num('BUTTON_FAIL') / 4);
    log('Clicked the "Download" button');
    buttonFailTimeout.refresh();
    // -------- Check for the unable-to-download monad -------- //
    const unableToDownload = await page
        .evaluate(() => {
        const modal = document.querySelector('.modal');
        if (modal) {
            return (
            // @ts-ignore
            modal.offsetParent ||
                window.getComputedStyle(modal).visibility == 'visible');
        }
        return false;
    })
        .catch(_ => true);
    if (unableToDownload) {
        rej(true);
    }
});
