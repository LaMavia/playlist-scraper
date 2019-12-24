"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const Playlist = __importStar(require("./playlist"));
const YT = __importStar(require("./youtube"));
const Spotify = __importStar(require("./spotify"));
const Download = __importStar(require("./download"));
const util_1 = require("./util");
const inquirer_1 = __importDefault(require("inquirer"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = require("path");
const env_1 = require("./env");
env_1.load_env();
(async () => {
    const [url_or_id, out, repeat_] = process.argv.slice(2);
    const repeat = ['t', 'T', 'true', 'True', 'y', 'Y', 'Yes', '1'].includes(repeat_);
    if (!url_or_id || !out)
        return console.log(`
      HOW TO USE: <url or playlist_id> <output_path> <repeat?>
    `);
    // -------- Prepare the dir -------- //
    await fs_extra_1.default.mkdir(path_1.resolve(process.cwd(), out)).catch(e => {
        console.error(`Error making ${out}; ${e}`);
    });
    const id = Spotify.getID(url_or_id);
    const ui = new inquirer_1.default.ui.BottomBar();
    ui.updateBottomBar('Fetching the Spotify API');
    let { items } = await Playlist.scrapePlaylist(id).catch(r => {
        console.error(r);
        return { items: [] };
    });
    ui.updateBottomBar(`Fetched ${items.length} items from the Spotify API`);
    const browser = await puppeteer_1.default
        .launch({
        headless: !false,
        timeout: env_1.num('GOTO'),
        args: ['--incognito', '--lang=en-US,en'],
    })
        .catch(r => {
        console.error(`Error launching the Browser; ${r}`);
    });
    if (!browser)
        return;
    let completedCount = 0;
    const totalItems = items.length;
    while (items.length > 0) {
        const log = util_1.log(completedCount, totalItems, ui);
        // -------- Pops the first item off the stack -------- //
        const t = items.shift();
        if (!(t && t.track))
            continue;
        log(`Starting ${t.track.name}`);
        await YT.scrapeSearch(t.track, browser)
            .then((tr) => {
            try {
                log(`Got "${tr.name}"'s YT url`);
                tr.album = t.track.album;
                // -------- Save the url for later -------- //
                // -------- Prevents extra yt-scraping -------- //
                Object.assign(t, {
                    url: tr.url,
                });
                return Download.download(tr, out, browser, ui, completedCount, totalItems);
            }
            catch (err) {
                return log(err);
            }
        })
            .then(() => {
            completedCount++;
            return log(`Downloaded ${t.track.name}`);
        })
            .catch((t => (rep) => {
            log(`Error downloading ${t.track.name}`);
            // console.error(rep)
            if (repeat || rep || env_1.bool('REPEAT'))
                items.push(t);
        })(t));
        if (completedCount == totalItems)
            break;
        // -------- Close any rogue pages to prevent memory leaks -------- //
        for (const page of (await browser.pages()).slice(1) || []) {
            !page.isClosed() &&
                (await page.close().catch(_ => {
                    ui.updateBottomBar('Error closing a page, but keep calm and scrape on!');
                }));
        }
    }
    console.log('\nClosing the browser');
    await browser.close().then(() => {
        process.exit(0);
    });
    return 0;
})();
