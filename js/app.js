/* =========================================================
   SETCHORD - MAIN JAVASCRIPT
   Handles:
   - Dashboard
   - Songs page
   - Song viewer
   - Local storage
   - Search
   - Add songs
   - Chord transposition
========================================================= */


/* =========================================================
   DEFAULT SONGS
========================================================= */

const defaultSongs = [

    {
        title: "Goodness of God",
        artist: "Bethel Music",
        key: "G",

        chart: `[G]I love You Lord
[C]Oh Your mercy never fails me
[Em]All my days I've been held in Your hands
[D]From the moment that I wake up
[G]Until I lay my head
[C]I will sing of the goodness of God`,

        url: ""
    },


    {
        title: "Build My Life",
        artist: "Housefires",
        key: "G",

        chart: `[G]Worthy of every song we could ever sing
[D]Worthy of all the praise we could ever bring
[Em]Worthy of every breath we could ever breathe
[C]We live for You`,

        url: ""
    },


    {
        title: "10,000 Reasons",
        artist: "Matt Redman",
        key: "C",

        chart: `[C]Bless the Lord O my soul
[G]O my soul
[Am]Worship His holy name
[F]Sing like never before
[C]O my soul
[G]I'll worship Your holy name`,

        url: ""
    }

];


/* =========================================================
   LOAD SONGS FROM LOCAL STORAGE
========================================================= */

let songs =
    JSON.parse(
        localStorage.getItem("setchordSongs")
    ) || defaultSongs;


/* =========================================================
   SAVE SONGS
========================================================= */

function saveSongs() {

    localStorage.setItem(
        "setchordSongs",
        JSON.stringify(songs)
    );

}


/* =========================================================
   PAGE DETECTION
========================================================= */

const currentPage =
    window.location.pathname.split("/").pop();


/*
    If the page is empty, we assume index.html.
*/

const page =
    currentPage || "index.html";


/* =========================================================
   SONGS PAGE
========================================================= */

const songList =
    document.getElementById("songList");


/* =========================================================
   DISPLAY SONGS
========================================================= */

function displaySongs(songArray) {

    /*
        This prevents errors when this function
        is called on index.html or song.html.
    */

    if (!songList) {
        return;
    }


    songList.innerHTML = "";


    /* -----------------------------------------
       NO SONGS
    ----------------------------------------- */

    if (songArray.length === 0) {

        songList.innerHTML = `
            <p class="empty-message">
                No songs found.
            </p>
        `;

        return;
    }


    /* -----------------------------------------
       CREATE SONG CARDS
    ----------------------------------------- */

    for (let i = 0; i < songArray.length; i++) {

        const song = songArray[i];


        const songCard =
            document.createElement("div");


        songCard.classList.add("song-card");


        songCard.innerHTML = `

            <div class="song-info">

                <h3>
                    ${song.title}
                </h3>

                <p>
                    ${song.artist}
                </p>

            </div>


            <div class="song-key">

                <span>
                    Key
                </span>

                <strong>
                    ${song.key}
                </strong>

            </div>

        `;


        /*
            Find the song's real position
            inside the main songs array.
        */

        const realIndex =
            songs.indexOf(song);


        /* -----------------------------------------
           CLICK SONG
        ----------------------------------------- */

        songCard.addEventListener(
            "click",
            function () {

                localStorage.setItem(
                    "selectedSongIndex",
                    realIndex
                );


                window.location.href =
                    "song.html";

            }
        );


        songList.appendChild(songCard);

    }

}


/* =========================================================
   INITIAL SONG DISPLAY
========================================================= */

displaySongs(songs);


/* =========================================================
   SEARCH
========================================================= */

const searchInput =
    document.getElementById("searchInput");


if (searchInput) {

    searchInput.addEventListener(
        "input",
        function () {

            const searchText =
                searchInput.value
                    .toLowerCase()
                    .trim();


            const filteredSongs =
                songs.filter(
                    function (song) {

                        return (

                            song.title
                                .toLowerCase()
                                .includes(searchText)

                            ||

                            song.artist
                                .toLowerCase()
                                .includes(searchText)

                        );

                    }
                );


            displaySongs(filteredSongs);

        }
    );

}


/* =========================================================
   ADD SONG FORM
========================================================= */

const addSongButton =
    document.getElementById("addSongButton");


const addSongForm =
    document.getElementById("addSongForm");


const cancelSongButton =
    document.getElementById("cancelSongButton");


const saveSongButton =
    document.getElementById("saveSongButton");


/* =========================================================
   FORM INPUTS
========================================================= */

const songTitle =
    document.getElementById("songTitle");


const songArtist =
    document.getElementById("songArtist");


const songKey =
    document.getElementById("songKey");


const songChart =
    document.getElementById("songChart");


const songUrl =
    document.getElementById("songUrl");


/* =========================================================
   SHOW ADD SONG FORM
========================================================= */

if (addSongButton) {

    addSongButton.addEventListener(
        "click",
        function () {

            addSongForm.style.display =
                "block";


            /*
                Scroll to the form
                so it is visible.
            */

            addSongForm.scrollIntoView({
                behavior: "smooth"
            });

        }
    );

}


/* =========================================================
   CANCEL ADD SONG
========================================================= */

if (cancelSongButton) {

    cancelSongButton.addEventListener(
        "click",
        function () {

            addSongForm.style.display =
                "none";

        }
    );

}


/* =========================================================
   SAVE NEW SONG
========================================================= */

if (saveSongButton) {

    saveSongButton.addEventListener(
        "click",
        function () {

            /* -----------------------------------------
               VALIDATE TITLE
            ----------------------------------------- */

            if (
                songTitle.value.trim() === ""
            ) {

                alert(
                    "Please enter a song title."
                );

                songTitle.focus();

                return;
            }


            /* -----------------------------------------
               VALIDATE ARTIST
            ----------------------------------------- */

            if (
                songArtist.value.trim() === ""
            ) {

                alert(
                    "Please enter the artist."
                );

                songArtist.focus();

                return;
            }


            /* -----------------------------------------
               CREATE SONG OBJECT
            ----------------------------------------- */

            const newSong = {

                title:
                    songTitle.value.trim(),

                artist:
                    songArtist.value.trim(),

                key:
                    songKey.value,

                chart:
                    songChart.value,

                url:
                    songUrl.value.trim()

            };


            /* -----------------------------------------
               ADD TO ARRAY
            ----------------------------------------- */

            songs.push(newSong);


            /* -----------------------------------------
               SAVE TO LOCAL STORAGE
            ----------------------------------------- */

            saveSongs();


            /* -----------------------------------------
               UPDATE SONG LIST
            ----------------------------------------- */

            displaySongs(songs);


            /* -----------------------------------------
               HIDE FORM
            ----------------------------------------- */

            addSongForm.style.display =
                "none";


            /* -----------------------------------------
               CLEAR FORM
            ----------------------------------------- */

            songTitle.value = "";

            songArtist.value = "";

            songKey.value = "C";

            songChart.value = "";

            songUrl.value = "";


            /* -----------------------------------------
               MESSAGE
            ----------------------------------------- */

            alert(
                "Song added successfully!"
            );

        }
    );

}


/* =========================================================
   DASHBOARD
========================================================= */

const songCount =
    document.getElementById("songCount");


if (songCount) {

    songCount.textContent =
        songs.length;

}


/* =========================================================
   RECENT SONGS
========================================================= */

const recentSongs =
    document.getElementById("recentSongs");


if (recentSongs) {

    if (songs.length === 0) {

        recentSongs.innerHTML = `
            <p class="empty-message">
                No songs added yet.
            </p>
        `;

    } else {

        /*
            Get the latest 5 songs.
        */

        const recent =
            songs
                .slice(-5)
                .reverse();


        recentSongs.innerHTML = "";


        recent.forEach(
            function (song) {

                const item =
                    document.createElement("div");


                item.classList.add(
                    "recent-song"
                );


                item.innerHTML = `

                    <div>

                        <h3>
                            ${song.title}
                        </h3>

                        <p>
                            ${song.artist}
                        </p>

                    </div>


                    <strong>
                        ${song.key}
                    </strong>

                `;


                recentSongs.appendChild(item);

            }
        );

    }

}


/* =========================================================
   =========================================================

   SONG VIEWER

   Everything below this point handles song.html.

   =========================================================
   ========================================================= */


/* =========================================================
   GET SELECTED SONG
========================================================= */

const selectedSongIndex =
    localStorage.getItem(
        "selectedSongIndex"
    );


/* =========================================================
   SONG VIEWER ELEMENTS
========================================================= */

const viewerTitle =
    document.getElementById("viewerTitle");


const viewerArtist =
    document.getElementById("viewerArtist");


const currentKeyElement =
    document.getElementById("currentKey");


const songChartViewer =
    document.getElementById(
        "songChartViewer"
    );


const increaseKeyButton =
    document.getElementById(
        "increaseKey"
    );


const decreaseKeyButton =
    document.getElementById(
        "decreaseKey"
    );


/* =========================================================
   CHECK IF WE ARE ON SONG VIEWER
========================================================= */

if (
    viewerTitle &&
    viewerArtist &&
    currentKeyElement &&
    songChartViewer
) {

    initializeSongViewer();

}


/* =========================================================
   INITIALIZE SONG VIEWER
========================================================= */

function initializeSongViewer() {

    /* -----------------------------------------
       CHECK SELECTED SONG
    ----------------------------------------- */

    if (
        selectedSongIndex === null
    ) {

        window.location.href =
            "songs.html";

        return;
    }


    /* -----------------------------------------
       GET SONG
    ----------------------------------------- */

    const song =
        songs[
            Number(selectedSongIndex)
        ];


    /* -----------------------------------------
       CHECK SONG EXISTS
    ----------------------------------------- */

    if (!song) {

        window.location.href =
            "songs.html";

        return;
    }


    /* -----------------------------------------
       DISPLAY SONG INFORMATION
    ----------------------------------------- */

    viewerTitle.textContent =
        song.title;


    viewerArtist.textContent =
        song.artist;


    /* -----------------------------------------
       STORE ORIGINAL KEY
    ----------------------------------------- */

    let originalKey =
        song.key;


    let currentKey =
        song.key;


    /* -----------------------------------------
       DISPLAY ORIGINAL CHART
    ----------------------------------------- */

    displayTransposedChart(
        song.chart,
        originalKey,
        currentKey
    );


    /* -----------------------------------------
       UPDATE CURRENT KEY
    ----------------------------------------- */

    currentKeyElement.textContent =
        currentKey;


    /* =====================================================
       INCREASE KEY
    ===================================================== */

    if (increaseKeyButton) {

        increaseKeyButton.addEventListener(
            "click",
            function () {

                currentKey =
                    transposeKey(
                        currentKey,
                        1
                    );


                currentKeyElement.textContent =
                    currentKey;


                displayTransposedChart(
                    song.chart,
                    originalKey,
                    currentKey
                );

            }
        );

    }


    /* =====================================================
       DECREASE KEY
    ===================================================== */

    if (decreaseKeyButton) {

        decreaseKeyButton.addEventListener(
            "click",
            function () {

                currentKey =
                    transposeKey(
                        currentKey,
                        -1
                    );


                currentKeyElement.textContent =
                    currentKey;


                displayTransposedChart(
                    song.chart,
                    originalKey,
                    currentKey
                );

            }
        );

    }

}


/* =========================================================
   MUSICAL NOTES
========================================================= */

const notes = [

    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B"

];


/* =========================================================
   CONVERT FLAT NOTES TO SHARPS
========================================================= */

const flatToSharp = {

    "Db": "C#",

    "Eb": "D#",

    "Gb": "F#",

    "Ab": "G#",

    "Bb": "A#"

};


/* =========================================================
   TRANSPOSE KEY
========================================================= */

function transposeKey(
    key,
    semitones
) {

    /*
        Convert flat key to sharp.
    */

    if (flatToSharp[key]) {

        key =
            flatToSharp[key];

    }


    /* -----------------------------------------
       Find key position
    ----------------------------------------- */

    let index =
        notes.indexOf(key);


    /*
        If the key is not recognized,
        return the original key.
    */

    if (index === -1) {

        return key;

    }


    /* -----------------------------------------
       Move the key
    ----------------------------------------- */

    index += semitones;


    /*
        Handle going below C.
    */

    if (index < 0) {

        index =
            index + notes.length;

    }


    /*
        Handle going above B.
    */

    if (
        index >= notes.length
    ) {

        index =
            index % notes.length;

    }


    return notes[index];

}


/* =========================================================
   CALCULATE TRANSPOSE DISTANCE
========================================================= */

function getTransposeAmount(
    originalKey,
    newKey
) {

    /*
        Convert flats first.
    */

    if (flatToSharp[originalKey]) {

        originalKey =
            flatToSharp[originalKey];

    }


    if (flatToSharp[newKey]) {

        newKey =
            flatToSharp[newKey];

    }


    const originalIndex =
        notes.indexOf(originalKey);


    const newIndex =
        notes.indexOf(newKey);


    if (
        originalIndex === -1 ||
        newIndex === -1
    ) {

        return 0;

    }


    let amount =
        newIndex - originalIndex;


    /*
        Example:

        C → B

        -1 is correct.
    */


    return amount;

}


/* =========================================================
   TRANSPOSE A SINGLE CHORD
========================================================= */

function transposeChord(
    chord,
    amount
) {

    /*
        Remove whitespace.
    */

    chord =
        chord.trim();


    /*
        Handle slash chords.

        Example:

        G/B

        becomes

        A/C#
    */

    if (chord.includes("/")) {

        const parts =
            chord.split("/");


        const mainChord =
            transposeChord(
                parts[0],
                amount
            );


        const bassNote =
            transposeNote(
                parts[1],
                amount
            );


        return (
            mainChord +
            "/" +
            bassNote
        );

    }


    /*
        Match the root note.

        Examples:

        C
        C#
        Db
        Am
        F#m7
        Gsus4
    */

    const match =
        chord.match(
            /^([A-Ga-g])([#b]?)(.*)$/
        );


    if (!match) {

        return chord;

    }


    const letter =
        match[1].toUpperCase();


    const accidental =
        match[2];


    const chordSuffix =
        match[3];


    let root =
        letter +
        accidental;


    /*
        Convert flats to sharps.
    */

    if (flatToSharp[root]) {

        root =
            flatToSharp[root];

    }


    /*
        Transpose root note.
    */

    const newRoot =
        transposeNote(
            root,
            amount
        );


    /*
        Put suffix back.

        Example:

        Am7

        root = A

        suffix = m7

        result = Cm7
    */

    return (
        newRoot +
        chordSuffix
    );

}


/* =========================================================
   TRANSPOSE NOTE
========================================================= */

function transposeNote(
    note,
    amount
) {

    /*
        Convert flat to sharp.
    */

    if (flatToSharp[note]) {

        note =
            flatToSharp[note];

    }


    const index =
        notes.indexOf(note);


    if (index === -1) {

        return note;

    }


    let newIndex =
        index + amount;


    /*
        JavaScript's % can return
        negative numbers, so fix it.
    */

    newIndex =
        (
            newIndex %
            notes.length +
            notes.length
        ) %
        notes.length;


    return notes[newIndex];

}


/* =========================================================
   TRANSPOSE CHART
========================================================= */

function transposeChart(
    chart,
    originalKey,
    newKey
) {

    /*
        Find how many semitones
        the song needs to move.
    */

    const amount =
        getTransposeAmount(
            originalKey,
            newKey
        );


    /*
        Find chords inside [ ].

        Example:

        [G]I love You

        becomes:

        [A]I love You
    */

    const transposedChart =
        chart.replace(
            /\[([^\]]+)\]/g,
            function (
                fullMatch,
                chord
            ) {

                const newChord =
                    transposeChord(
                        chord,
                        amount
                    );


                return (
                    "[" +
                    newChord +
                    "]"
                );

            }
        );


    return transposedChart;

}


/* =========================================================
   DISPLAY TRANSPOSED CHART
========================================================= */

function displayTransposedChart(
    chart,
    originalKey,
    currentKey
) {

    if (!songChartViewer) {

        return;

    }


    const transposedChart =
        transposeChart(
            chart,
            originalKey,
            currentKey
        );


    songChartViewer.textContent =
        transposedChart;

}

/* =========================================================
   AUTOMATIC KEY UPDATE
========================================================= */

if (songChart) {

    songChart.addEventListener(
        "input",
        function() {

            const detectedKey =
                detectKey(
                    songChart.value
                );

            songKey.value =
                detectedKey;

        }
    );

}

/* =========================================================
   IMPORT SONG
========================================================= */

const importSongButton =
    document.getElementById(
        "importSongButton"
    );


if (importSongButton) {

    importSongButton.addEventListener(
        "click",
        async function() {

            const url =
                songUrl.value.trim();


            if (url === "") {

                alert(
                    "Please enter a song chart URL."
                );

                songUrl.focus();

                return;

            }


            try {

                importSongButton.textContent =
                    "Importing...";

                importSongButton.disabled =
                    true;


                const response =
                    await fetch(
                        "/api/import-song",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                url: url
                            })
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Failed to import song."
                    );

                }


                const song =
                    await response.json();


                songTitle.value =
                    song.title || "";


                songArtist.value =
                    song.artist || "";


                songChart.value =
                    song.chart || "";


                const detectedKey =
                    detectKey(
                        song.chart || ""
                    );


                songKey.value =
                    song.key ||
                    detectedKey;


                alert(
                    "Song imported successfully!"
                );


            } catch (error) {

                console.error(error);

                alert(
                    "Unable to import this song. Please check the URL."
                );

            }


            importSongButton.textContent =
                "Import";

            importSongButton.disabled =
                false;

        }
    );

}