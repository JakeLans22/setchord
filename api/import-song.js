const cheerio = require("cheerio");


/* =========================================================
   IMPORT SONG
========================================================= */

module.exports = async function handler(req, res) {

    if (req.method !== "POST") {

        return res.status(405).json({
            error: "Method not allowed."
        });

    }


    try {

        const { url } = req.body;


        if (!url) {

            return res.status(400).json({
                error: "Song URL is required."
            });

        }


        /* ---------------------------------------------
           VALIDATE URL
        --------------------------------------------- */

        let parsedUrl;

        try {

            parsedUrl =
                new URL(url);

        } catch {

            return res.status(400).json({
                error: "Invalid URL."
            });

        }


        if (
            parsedUrl.protocol !== "http:" &&
            parsedUrl.protocol !== "https:"
        ) {

            return res.status(400).json({
                error: "Only HTTP and HTTPS URLs are allowed."
            });

        }


        /* ---------------------------------------------
           FETCH SONG PAGE
        --------------------------------------------- */

        const response =
            await fetch(url, {

                headers: {
                    "User-Agent":
                        "Mozilla/5.0 SetChord"
                }

            });


        if (!response.ok) {

            return res.status(400).json({

                error:
                    `Unable to access the page. Status: ${response.status}`

            });

        }


        const html =
            await response.text();


        /* ---------------------------------------------
           LOAD HTML
        --------------------------------------------- */

        const $ =
            cheerio.load(html);


        /* ---------------------------------------------
           TITLE
        --------------------------------------------- */

        let title =

            $("meta[property='og:title']")
                .attr("content")

            ||

            $("meta[name='twitter:title']")
                .attr("content")

            ||

            $("title")
                .text()

            ||

            "";


        title =
            cleanText(title);


        /* ---------------------------------------------
           ARTIST
        --------------------------------------------- */

        let artist =

            $("meta[name='author']")
                .attr("content")

            ||

            $("meta[property='music:musician']")
                .attr("content")

            ||

            "";


        artist =
            cleanText(artist);


        /* ---------------------------------------------
           ORIGINAL KEY
        --------------------------------------------- */

        let key =
            findKey($);


        /* ---------------------------------------------
           CHART
        --------------------------------------------- */

        let chart =
            extractChart($);


        /* ---------------------------------------------
           DETECT KEY FROM CHART
        --------------------------------------------- */

        if (!key && chart) {

            key =
                detectKey(chart);

        }


        /* ---------------------------------------------
           RETURN RESULT
        --------------------------------------------- */

        return res.status(200).json({

            title: title,

            artist: artist,

            key: key,

            chart: chart,

            url: url

        });


    } catch (error) {

        console.error(
            "Import error:",
            error
        );


        return res.status(500).json({

            error:
                "Something went wrong while importing the song."

        });

    }

};


/* =========================================================
   CLEAN TEXT
========================================================= */

function cleanText(text) {

    return String(text || "")
        .replace(/\s+/g, " ")
        .trim();

}


/* =========================================================
   FIND ORIGINAL KEY
========================================================= */

function findKey($) {

    const bodyText =
        $("body")
            .text()
            .replace(/\s+/g, " ");


    const match =
        bodyText.match(

            /\b(?:Original\s+Key|Key|Key\s+of)\s*[:\-]?\s*([A-G](?:#|b)?)/i

        );


    if (!match) {

        return "";

    }


    return normalizeKey(
        match[1]
    );

}


/* =========================================================
   NORMALIZE KEY
========================================================= */

function normalizeKey(key) {

    if (!key) {
        return "";
    }


    key =
        key.trim();


    return (
        key.charAt(0).toUpperCase() +
        key.substring(1)
    );

}


/* =========================================================
   EXTRACT SONG CHART
========================================================= */

function extractChart($) {

    const selectors = [

        "pre",

        ".song-chart",

        ".chords",

        ".chord-chart",

        ".lyrics",

        ".tab",

        "[class*='chord']",

        "[class*='lyrics']",

        "[id*='chord']",

        "[id*='lyrics']"

    ];


    let bestText = "";


    selectors.forEach(
        function(selector) {

            $(selector).each(
                function() {

                    const text =
                        $(this).text().trim();


                    if (
                        text.length >
                        bestText.length
                    ) {

                        bestText =
                            text;

                    }

                }
            );

        }
    );


    if (!bestText) {

        return "";

    }


    return formatChart(
        bestText
    );

}


/* =========================================================
   FORMAT CHART
========================================================= */

function formatChart(text) {

    return text

        .replace(/\r/g, "")

        .replace(
            /\n{3,}/g,
            "\n\n"
        )

        .trim();

}


/* =========================================================
   DETECT KEY FROM CHORDS
========================================================= */

function detectKey(chart) {

    const matches =
        chart.match(
            /\[([A-G][#b]?)[^\]]*\]/g
        );


    if (!matches) {

        return "";

    }


    const counts = {};


    matches.forEach(
        function(match) {

            const chord =
                match
                    .replace("[", "")
                    .replace("]", "");


            const rootMatch =
                chord.match(
                    /^([A-G][#b]?)/
                );


            if (!rootMatch) {
                return;
            }


            const root =
                normalizeKey(
                    rootMatch[1]
                );


            if (!counts[root]) {

                counts[root] = 0;

            }


            counts[root]++;

        }
    );


    let detectedKey = "";

    let highestCount = 0;


    for (
        const key in counts
    ) {

        if (
            counts[key] >
            highestCount
        ) {

            highestCount =
                counts[key];

            detectedKey =
                key;

        }

    }


    return detectedKey;

}