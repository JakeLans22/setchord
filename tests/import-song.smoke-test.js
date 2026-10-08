const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const http = require("node:http");
const https = require("node:https");
const handler = require("../api/import-song");

function mockRequest(html, status = 200) {
    return (_url, _options, callback) => {
        const request = new EventEmitter();
        process.nextTick(() => {
            const response = Readable.from([html]);
            response.statusCode = status;
            response.headers = { "content-type": "text/html" };
            response.resume = response.resume.bind(response);
            callback(response);
        });
        return request;
    };
}

function mockResponse() {
    return {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

async function run(url, html) {
    const target = new URL(url).protocol === "https:" ? https : http;
    const original = target.get;
    target.get = mockRequest(html);
    try {
        const response = mockResponse();
        await handler({ method: "POST", body: { url } }, response);
        return response;
    } finally {
        target.get = original;
    }
}

async function main() {
    const store = {
        store: {
            page: {
                data: {
                    tab: {
                        song_name: "Lilim",
                        artist_name: "Victory Worship",
                        tonality_name: "E",
                        tab_view: {
                            wiki_tab: {
                                content: "[tab]\n[Verse 1]\n[ch]E[/ch] [ch]G#m[/ch] [ch]A[/ch] Panginoon, ang nais ko\n[ch]C#m[/ch] [ch]B[/ch] Kagandahan mo ay pagmasdan"
                            }
                        }
                    }
                }
            }
        }
    };
    const ugHtml = `<html><div class="js-store" data-content='${JSON.stringify(store)}'></div></html>`;
    const ug = await run("https://8.8.8.8/tab", ugHtml);
    assert.equal(ug.statusCode, 200);
    assert.equal(ug.body.title, "Lilim");
    assert.equal(ug.body.artist, "Victory Worship");
    assert.equal(ug.body.key, "E");
    assert.match(ug.body.chart, /\[E\] \[G#m\] \[A\] Panginoon, ang nais ko/);
    assert.match(ug.body.chart, /\[C#m\] \[B\] Kagandahan mo ay pagmasdan/);
    assert.doesNotMatch(ug.body.chart, /\[ch\]|\[tab\]/);

    const alignedHtml = '<html><head><meta property="og:title" content="Aligned Song"></head><body><pre>G     D/F#    Em7\nG     D/F#    C\n[G]I love [C]you</pre></body></html>';
    const aligned = await run("https://8.8.8.8/aligned", alignedHtml);
    assert.equal(aligned.statusCode, 200);
    assert.match(aligned.body.chart, /\[G\] {5}\[D\/F#\] {4}\[Em7\]/);
    assert.match(aligned.body.chart, /\[G\]I love \[C\]you/);

    const genericHtml = `<html><head><meta property="og:title" content="Goodness of God Chords"></head><body><p>Artist: Bethel Music</p><pre>[G]I love You Lord\n[C]Oh Your mercy never fails me\n[Em]All my days</pre></body></html>`;
    const generic = await run("https://8.8.8.8/song", genericHtml);
    assert.equal(generic.statusCode, 200);
    assert.match(generic.body.chart, /\[G\]I love You Lord/);
    assert.equal(generic.body.key, "G");

    const noChart = await run(
        "https://8.8.8.8/song",
        '<html><head><meta property="og:title" content="Song"></head><body>Artist name</body></html>'
    );
    assert.equal(noChart.statusCode, 422);
    assert.match(noChart.body.error, /could not extract a song chart/i);
    console.log("Song import smoke tests passed.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
