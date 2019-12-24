"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Spotify = __importStar(require("./spotify"));
async function scrapePlaylist(id) {
    const { access_token, token_type } = await Spotify.getAccessToken();
    const res = await Spotify.reqPlaylist(id, token_type, access_token).catch(r => {
        console.error(`[spotify]> Getting playlist ${id} failed; ${new Error(r)}`);
        return Spotify.makeEmptyRes();
    });
    return res;
}
exports.scrapePlaylist = scrapePlaylist;
