"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const makeSearchURI = (track) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`"${track.album ? track.album.artists.map(a => a.name).join(' ') : ''}" ${track.name.toLowerCase()}`)}&sp=EgIQAQ%253D%253D`;
exports.scrapeSearch = async (track, browser) => {
    // -------- Checking whether the track's already been scraped  -------- //
    if (track.url)
        return track;
    const page = await browser.newPage();
    page.setExtraHTTPHeaders({
    // 'Accept-Language': 'en',
    });
    await page.goto(makeSearchURI(track));
    await page.waitForSelector('span.style-scope.ytd-thumbnail-overlay-time-status-renderer');
    const res = await page.evaluate((duration_ms, title, author) => {
        const RESULT_SEL = '#contents > ytd-video-renderer';
        const TITLE_SEL = '#video-title';
        const DURATION_SEL = '#overlays > ytd-thumbnail-overlay-time-status-renderer > span';
        const normalize = (x) => x.toLowerCase().replace(/\W/gi, '');
        const score = (target_track, track) => {
            // -------- Utility functions -------- //
            const count = (vec, x) => {
                const j = words.indexOf(normalize(x));
                j !== -1 && vec[j]++;
                return vec;
            };
            const make_words = (t) => {
                const from_title = t.name ? t.name.split(/\s+/) : [];
                const from_author = t.album
                    ? t.album.artists.reduce((acc, a) => acc.concat(a.name.split(/\s+/).filter(Boolean) // /(various)/i.test(a.name) ? [] :
                    ), []) // [0].name.split(/\s+/)
                    : []; // (t.name || '').split(/\s+/)
                return [...from_title, ...from_author];
            };
            // -------- Algoryth -------- //
            const words_right = make_words(target_track);
            const words_track = make_words(track);
            // -------- Vector of all the words -------- //
            const words = Array.from(new Set([...words_right, ...words_track].map(normalize).filter(Boolean)));
            // -------- Vectors of the words in the titles -------- //
            const w1 = words_right.reduce(count, new Array(words.length).fill(0));
            const w2 = words_track.reduce(count, new Array(words.length).fill(0));
            // -------- Calc the cos -------- //
            const dot_product = w1.reduce((acc, a, i) => (acc += a * w2[i]), 0);
            const denominator = Math.sqrt(w1.reduce((acc, x) => (acc += x ** 2)) *
                w2.reduce((acc, x) => (acc += x ** 2)));
            const d_duration = Math.abs((track.duration_ms || 0) - duration_ms) || 0.01; // Prevent infinite results
            debugger;
            console.log(d_duration);
            return dot_product / (denominator * d_duration ** 2);
        };
        const parseTime = (t) => t
            .split(':')
            .reverse()
            .map((a, i) => (+a || 0) * 60 ** i)
            .reduce((acc, x) => (acc += x), 0);
        const title_regexes = `${title} ${author}`
            .trim()
            .split(' ')
            .filter(Boolean)
            .map(t => new RegExp(t.replace(/[\.\\\*\+\[\]\(\)]*/gi, ''), 'i'));
        const score_word_match = (t) => t.matches / 1000;
        const score_of_track = (t) => score({ name: title, duration_ms, author }, t) /
            ((t.name || '').split(/\s+/gi).length + 1);
        /**
         * (t: TrackInner): number =>
          t.matches /
          (t.duration_ms && duration_ms <= t.duration_ms
            ? duration_ms - (t.duration_ms || 0)
            : 10 ** 15)
         */
        const match = Array.from(document.querySelectorAll(RESULT_SEL))
            .map(r => {
            const name_el = r.querySelector(TITLE_SEL), name = name_el ? (name_el.innerText || '').trim() : '-';
            const duration_el = r.querySelector(DURATION_SEL), duration_ms = duration_el
                ? parseTime((duration_el.textContent || '').trim()) * 1000
                : 0;
            const url = name_el ? name_el.href || '' : '-';
            const artist_el = r.querySelector('.style-scope.ytd-channel-name.complex-string'), artist = normalize(artist_el ? artist_el.textContent || '' : '');
            const matches = title_regexes.reduce((acc, r) => {
                if (r.test(name))
                    acc++;
                return acc;
            }, 0);
            const t = {
                name,
                artist,
                url,
                duration_ms,
                matches,
                score: 0,
            };
            t.score = score_of_track(t);
            console.log(t.score);
            return t;
        })
            .reduce((matched_res, track) => !matched_res || track.score > matched_res.score ? track : matched_res);
        delete match.matches;
        delete match.score;
        return match;
    }, track.duration_ms, track.name, track.album.artists[0].name);
    await page.close();
    process.env['NODE_ENV'] === 'development' &&
        console.log(`\n${track.album.artists.map(a => a.name).join(', ')} - ${track.name} => ${res.name}`);
    res.name = `${track.name} ~ ${track.album.artists
        .map(a => a.name)
        .join(', ')}`;
    return res;
};
