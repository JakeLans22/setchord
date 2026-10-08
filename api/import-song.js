const { lookup } = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const cheerio = require("cheerio");

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 12000;

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ success: false, error: "Only POST requests are allowed." });
    }

    const { url } = req.body || {};
    if (typeof url !== "string" || !url.trim()) {
        return res.status(400).json({ success: false, error: "Please provide a song chart URL." });
    }
    if (url.length > 2048) {
        return res.status(400).json({ success: false, error: "The song chart URL is too long." });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return res.status(400).json({ success: false, error: "The URL you entered is not valid." });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
        return res.status(400).json({ success: false, error: "Enter a public HTTP or HTTPS URL." });
    }
    if ((parsedUrl.protocol === "http:" && parsedUrl.port && parsedUrl.port !== "80")
        || (parsedUrl.protocol === "https:" && parsedUrl.port && parsedUrl.port !== "443")) {
        return res.status(400).json({ success: false, error: "Only standard public web ports are supported." });
    }

    try {
        const response = await fetchPublicPage(parsedUrl);
        if (!response.ok) {
            const blocked = response.status === 401 || response.status === 403 || response.status === 429;
            response.body?.destroy();
            return res.status(response.status === 404 ? 404 : 502).json({
                success: false,
                error: blocked
                    ? "The website blocked the request or requires access."
                    : response.status === 404
                        ? "The song page could not be found."
                        : `The website returned HTTP ${response.status}.`
            });
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType && !/html|xhtml/i.test(contentType)) {
            response.body?.destroy();
            return res.status(422).json({ success: false, error: "That URL did not return a song webpage." });
        }

        const html = await readLimitedBody(response);
        if (!html.trim()) {
            return res.status(422).json({ success: false, error: "The website returned an empty page." });
        }

        const $ = cheerio.load(html);
        const embeddedData = extractEmbeddedSongData($);
        const title = embeddedData.title || extractTitle($);
        const artist = embeddedData.artist || extractArtist($);
        const chart = extractChart($, embeddedData.chart);
        const key = embeddedData.key || findKey($) || detectKey(chart);

        if (!chart) {
            return res.status(422).json({
                success: false,
                error: "SetChord found the page, but could not extract a song chart. The site may require sign-in or load its chart in the browser."
            });
        }

        if (!title && !artist) {
            return res.status(422).json({
                success: false,
                error: "SetChord extracted the chart but could not identify its title or artist. Try another chart page."
            });
        }

        return res.status(200).json({
            success: true,
            title,
            artist,
            key,
            chart,
            url: parsedUrl.href
        });
    } catch (error) {
        if (error.message === "PAGE_TOO_LARGE") {
            return res.status(413).json({ success: false, error: "That webpage is too large to import." });
        }
        if (error.message === "PRIVATE_HOST") {
            return res.status(400).json({ success: false, error: "Use a public song-chart website URL." });
        }
        if (error.name === "AbortError" || error.name === "TimeoutError" || error.code === "ABORT_ERR") {
            return res.status(504).json({ success: false, error: "The song website took too long to respond." });
        }
        console.error("Song import failed:", error);
        return res.status(502).json({ success: false, error: "SetChord could not connect to that website." });
    }
};

async function fetchPublicPage(initialUrl) {
    let url = initialUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        if (url.username || url.password
            || (url.protocol === "http:" && url.port && url.port !== "80")
            || (url.protocol === "https:" && url.port && url.port !== "443")) {
            throw new Error("PRIVATE_HOST");
        }
        const address = await assertPublicHost(url.hostname);
        const requestModule = url.protocol === "https:" ? https : http;
        const response = await new Promise((resolve, reject) => {
            const request = requestModule.get(url, {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: {
                    "User-Agent": "SetChordSongImporter/1.0",
                    Accept: "text/html,application/xhtml+xml"
                },
                lookup: (_hostname, options, callback) => {
                    const result = { address, family: net.isIP(address) };
                    if (options && options.all) callback(null, [result]);
                    else callback(null, result.address, result.family);
                }
            }, (incoming) => {
                resolve({
                    status: incoming.statusCode || 0,
                    ok: incoming.statusCode >= 200 && incoming.statusCode < 300,
                    headers: {
                        get(name) {
                            const value = incoming.headers[name.toLowerCase()];
                            return Array.isArray(value) ? value.join(", ") : value || null;
                        }
                    },
                    body: incoming
                });
            });
            request.on("error", reject);
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            if (!location || redirects === MAX_REDIRECTS) throw new Error("Redirect limit exceeded");
            response.body?.destroy();
            url = new URL(location, url);
            if (!["http:", "https:"].includes(url.protocol)) throw new Error("PRIVATE_HOST");
            continue;
        }
        return response;
    }
    throw new Error("Redirect limit exceeded");
}

async function assertPublicHost(hostname) {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
        || host.endsWith(".internal") || host.endsWith(".test")) {
        throw new Error("PRIVATE_HOST");
    }

    let addresses;
    if (net.isIP(host)) {
        addresses = [{ address: host }];
    } else {
        addresses = await lookup(host, { all: true, verbatim: true });
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        throw new Error("PRIVATE_HOST");
    }
    return addresses[0].address;
}

function isPublicAddress(address) {
    if (net.isIPv4(address)) {
        const [a, b] = address.split(".").map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 192 && b === 0)
            || (a === 198 && (b === 18 || b === 19)));
    }
    if (!net.isIPv6(address)) return false;
    const words = ipv6Words(address);
    if (!words) return false;
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
        return isPublicAddress([
            words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255
        ].join("."));
    }
    const allZero = words.every((word) => word === 0);
    const loopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
    const uniqueLocal = (words[0] & 0xfe00) === 0xfc00;
    const linkLocal = (words[0] & 0xffc0) === 0xfe80;
    const multicast = (words[0] & 0xff00) === 0xff00;
    const ipv4Compatible = words.slice(0, 6).every((word) => word === 0);
    const sixToFour = words[0] === 0x2002;
    const teredoOrDocumentation = words[0] === 0x2001
        && (words[1] === 0 || words[1] === 0x0db8);
    const globalUnicast = (words[0] & 0xe000) === 0x2000;
    return !(allZero || loopback || uniqueLocal || linkLocal || multicast
        || ipv4Compatible || sixToFour || teredoOrDocumentation || !globalUnicast);
}

function ipv6Words(address) {
    let normalized = address.toLowerCase();
    if (normalized.includes(".")) {
        const separator = normalized.lastIndexOf(":");
        const octets = normalized.slice(separator + 1).split(".").map(Number);
        if (octets.length !== 4 || octets.some((octet) => octet < 0 || octet > 255)) return null;
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        normalized = `${normalized.slice(0, separator + 1)}${high}:${low}`;
    }

    const halves = normalized.split("::");
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const zeroCount = 8 - left.length - right.length;
    if (zeroCount < 0 || (halves.length === 1 && zeroCount !== 0)) return null;
    const groups = [...left, ...Array(zeroCount).fill("0"), ...right];
    if (groups.length !== 8 || groups.some((group) => !/^[\da-f]{1,4}$/.test(group))) return null;
    return groups.map((group) => Number.parseInt(group, 16));
}

async function readLimitedBody(response) {
    if (!response.body) return "";
    const chunks = [];
    let total = 0;
    for await (const value of response.body) {
        const chunk = Buffer.from(value);
        total += chunk.byteLength;
        if (total > MAX_HTML_BYTES) {
            response.body.destroy();
            throw new Error("PAGE_TOO_LARGE");
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, total).toString("utf8");
}

function extractEmbeddedSongData($) {
    const roots = [];
    $(".js-store[data-content], [data-content]").each((_index, element) => {
        const value = $(element).attr("data-content");
        if (value) {
            const parsed = parseJson(value);
            if (parsed) roots.push(parsed);
        }
    });
    $("script[type='application/ld+json'], script#__NEXT_DATA__").each((_index, element) => {
        const parsed = parseJson($(element).text());
        if (parsed) roots.push(parsed);
    });
    $("script:not([src])").each((_index, element) => {
        const text = $(element).text();
        if (!/song_name|artist_name|tonality_name|wiki_tab|js-store/i.test(text)) return;
        const parsed = parseJson(text);
        if (parsed) roots.push(parsed);
    });

    const result = { title: "", artist: "", key: "", chart: "" };
    let visited = 0;
    const visit = (value, field = "") => {
        if (!value || visited > 50000) return;
        visited += 1;
        if (typeof value === "string") {
            const text = value.trim();
            if (!text) return;
            if (!result.title && ["song_name", "title", "headline", "name"].includes(field.toLowerCase())) {
                result.title = cleanText(text);
            }
            if (!result.artist && ["artist_name", "artist", "by_artist"].includes(field.toLowerCase())) {
                result.artist = cleanText(text);
            }
            if (!result.key && ["tonality_name", "original_key", "key", "tonality"].includes(field.toLowerCase())) {
                const match = text.match(/^[A-G](?:#|b)?$/i);
                if (match) result.key = normalizeKey(match[0]);
            }
            if (field.toLowerCase() === "content" && isLikelyChart(normalizeChartMarkup(text))
                && text.length > result.chart.length) {
                result.chart = text;
            }
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => visit(item, field));
            return;
        }
        if (typeof value === "object") {
            Object.entries(value).forEach(([key, child]) => visit(child, key));
        }
    };
    roots.forEach((root) => visit(root));
    return result;
}

function parseJson(source) {
    const text = String(source || "").trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

function extractTitle($) {
    const candidates = [
        $("meta[property='og:title']").attr("content"),
        $("meta[name='twitter:title']").attr("content"),
        $("[itemprop='name']").first().attr("content"),
        $("h1").first().text(),
        $("title").first().text()
    ];
    const title = cleanText(candidates.find((value) => cleanText(value)));
    return title
        .replace(/\s+[|–-]\s+(?:ultimate guitar|chords?|tabs?|songsterr).*$/i, "")
        .replace(/\s+chords?\s+by\s+.+$/i, "")
        .trim();
}

function extractArtist($) {
    const candidates = [
        $("meta[name='author']").attr("content"),
        $("meta[property='music:musician']").attr("content"),
        $("[itemprop='byArtist'] [itemprop='name']").first().text(),
        $("[class*='artist']").first().text(),
        $("[id*='artist']").first().text()
    ];
    return cleanText(candidates.find((value) => cleanText(value)));
}

function findKey($) {
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const match = bodyText.match(/\b(?:Original\s+)?Key(?:\s+of)?\s*[:\-]?\s*([A-G](?:#|b)?)(?![a-z])/i);
    return match ? normalizeKey(match[1]) : "";
}

function extractChart($, embeddedChart = "") {
    if (embeddedChart) {
        const converted = normalizeChartMarkup(embeddedChart);
        if (isLikelyChart(converted)) return converted;
    }

    const selectors = [
        "pre", ".js-tab-content", ".js-tab-content__body", "[data-testid*='tab-content']",
        ".song-chart", ".chord-chart", ".chords", ".lyrics", ".tab",
        "[class*='song-chart']", "[class*='chord-chart']", "[class*='chords']",
        "[class*='lyrics']", "[class*='tab']", "[id*='song-chart']", "[id*='chord']", "[id*='lyrics']"
    ];
    let bestText = "";
    let bestScore = 0;
    selectors.forEach((selector) => {
        $(selector).each((_index, element) => {
            const text = htmlToText($(element));
            const normalized = normalizeChartMarkup(text);
            const score = chartScore(normalized);
            if (score > bestScore) {
                bestText = normalized;
                bestScore = score;
            }
        });
    });
    return bestScore > 0 ? bestText : "";
}

function htmlToText(element) {
    const clone = element.clone();
    clone.find("br").replaceWith("\n");
    clone.find("p, div, section, article, li, tr").prepend("\n").append("\n");
    clone.find("script, style, button, noscript").remove();
    return clone.text();
}

function normalizeChartMarkup(text) {
    let chart = String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/\[(?:ch)\](.*?)\[\/ch\]/gi, "[$1]")
        .replace(/\[(?:tab|\/tab)\]/gi, "\n")
        .replace(/\[\/?(?:ch|tab|highlight|highlight_start|highlight_end)\]/gi, "")
        .replace(/\[(Verse|Chorus|Pre[- ]?Chorus|Bridge|Intro|Outro|Interlude|Refrain|Hook|Ending|Break)([^\]]*)\]/gi, "$1$2")
        .replace(/\[\/(?:Verse|Chorus|Pre[- ]?Chorus|Bridge|Intro|Outro|Interlude|Refrain|Hook|Ending|Break)\]/gi, "")
        .replace(/\n[ \t]+/g, "\n");

    chart = chart.split("\n").map((line) => normalizeChordLine(line.trimEnd())).join("\n");
    return formatChart(chart);
}

function normalizeChordLine(line) {
    if (!line.trim() || /^\[(?:Verse|Chorus|Pre[- ]?Chorus|Bridge|Intro|Outro|Interlude|Refrain|Hook|Ending|Break)\b/i.test(line)) {
        return line;
    }
    if (/\[[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug|[0-9]|\/)[^\]]*\]/i.test(line)) {
        return line;
    }

    const tokens = [...line.matchAll(/\S+/g)];
    const chords = [];
    let index = 0;
    while (index < tokens.length && isChordToken(tokens[index][0])) {
        chords.push(tokens[index]);
        index += 1;
    }
    const confidentSingleChord = chords.length === 1
        && /(?:#|b|m|maj|min|sus|add|dim|aug|[0-9]|\/)/i.test(chords[0][0]);
    if (chords.length < 2 && !confidentSingleChord) return line;

    let normalized = "";
    chords.forEach((token, chordIndex) => {
        normalized += `[${token[0]}]`;
        if (chordIndex < chords.length - 1) {
            const gapStart = token.index + token[0].length;
            normalized += line.slice(gapStart, chords[chordIndex + 1].index);
        }
    });

    if (index < tokens.length) {
        normalized += line.slice(chords[chords.length - 1].index + chords[chords.length - 1][0].length);
    } else if (!normalized.includes(" ")) {
        return chords.map((token) => `[${token[0]}]`).join(" ");
    }
    return normalized;
}

function isChordToken(token) {
    return /^[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug|M|°|\+|-)?(?:\d+)?(?:sus\d+|add\d+|maj\d+|m\d+|dim\d*|aug)?(?:\/[A-G](?:#|b)?)?$/i.test(token);
}

function isLikelyChart(text) {
    return chartScore(text) >= 12;
}

function chartScore(text) {
    if (!text) return 0;
    const chordTags = (text.match(/\[[A-G](?:#|b)?(?:[^\]]*)\]/g) || []).length;
    const bareChordLines = text.split("\n").filter((line) => {
        const tokens = line.trim().split(/\s+/);
        return tokens.length >= 2 && tokens.length <= 14 && tokens.every(isChordToken);
    }).length;
    const sectionLabels = (text.match(/(?:^|\n)\s*(?:Verse|Chorus|Bridge|Intro|Outro|Interlude|Refrain)\b/gim) || []).length;
    const lyrics = (text.match(/[a-z]{3,}/gi) || []).length;
    if (!chordTags && !bareChordLines) return 0;
    return chordTags * 4 + bareChordLines * 4 + sectionLabels * 2 + Math.min(lyrics, 20) + Math.min(text.length / 120, 8);
}

function formatChart(text) {
    return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function detectKey(chart) {
    const counts = new Map();
    const matches = chart.matchAll(/\[([A-G](?:#|b)?)[^\]]*\]/g);
    for (const match of matches) {
        const key = normalizeKey(match[1]);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function normalizeKey(key) {
    return key ? key.trim().charAt(0).toUpperCase() + key.trim().slice(1) : "";
}

function cleanText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}
