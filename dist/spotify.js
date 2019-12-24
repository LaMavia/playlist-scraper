"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const encodeBase64 = (s) => Buffer.from(s).toString('base64');
exports.getID = (s) => {
    if (/^https?:\/\/.+/.test(s)) {
        const matches = s.match(/playlist\/(\w+)\??/);
        if (!matches)
            throw new Error(`Invalid playlist url ${s}`);
        return matches[1];
    }
    else
        return s;
};
exports.getAccessToken = () => {
    const encoded = `Basic ${encodeBase64(`${process.env['__ClIENT_ID__']}:${process.env['__CLIENT_SECRET__']}`)}`;
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: encoded,
    };
    return axios_1.default
        .request({
        url: `https://accounts.spotify.com/api/token?grant_type=client_credentials`,
        method: 'POST',
        headers,
    })
        .then(r => {
        return r.data;
    })
        .catch(err => {
        console.error(err);
        return err;
    });
};
exports.makePlaylistURI = (id) => `https://api.spotify.com/v1/playlists/${id}/tracks?market=ES&fields=items.track(album(images%2C%20artists(name%2C%20href))%2C%20name%2C%20duration_ms)`;
exports.makeEmptyRes = () => ({
    items: [],
});
exports.reqPlaylist = (id, token_type, token) => {
    return axios_1.default
        .request({
        url: exports.makePlaylistURI(id),
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
        },
    })
        .then(r => r.data)
        .catch(err => {
        console.error(err);
        return err;
    });
};
