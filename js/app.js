(() => {
    "use strict";

    const db = window.supabaseClient;
    const page = document.body.dataset.page;
    const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const FLAT_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    const KEY_INDEX = new Map([
        ["C", 0], ["B#", 0], ["C#", 1], ["Db", 1], ["D", 2], ["D#", 3], ["Eb", 3],
        ["E", 4], ["Fb", 4], ["E#", 5], ["F", 5], ["F#", 6], ["Gb", 6], ["G", 7],
        ["G#", 8], ["Ab", 8], ["A", 9], ["A#", 10], ["Bb", 10], ["B", 11], ["Cb", 11]
    ]);
    const KEY_OPTIONS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
    const SONGS_PER_PAGE = 10;
    const MUSICIAN_POSITIONS = ["Bass Guitar", "Acoustic Guitar", "Lead Guitar", "Keyboard", "Drums"];
    let currentUser = null;
    let originalKeyLocked = false;
    let songPage = 0;
    let songPageRequest = 0;
    const chartResizeObservers = new WeakMap();
    const songSectionNavigationRefreshers = new WeakMap();

    function showMessage(message, type = "error") {
        const element = document.getElementById("pageMessage");
        if (!element) return;
        element.textContent = message;
        const className = type === "success" ? "notice-success" : type === "info" ? "notice-info" : "notice-error";
        element.className = `notice ${className}`;
        element.hidden = false;
    }

    function clearMessage() {
        const element = document.getElementById("pageMessage");
        if (element) {
            element.textContent = "";
            element.hidden = true;
        }
    }

    async function updateSetSongKey(setSongId, performanceKey) {
        validateUuid(setSongId, "set song");
        if (performanceKey && !KEY_INDEX.has(performanceKey)) {
            throw new Error("Choose a valid performance key.");
        }
        const { data, error } = await requireClient().from("set_songs")
            .update({ performance_key: performanceKey || null })
            .eq("id", setSongId).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Song was not found in this set, or you do not have permission to update it.");
    }

    function isMissingPerformanceKeyColumn(error) {
        return error?.code === "42703"
            || /(?:column|field).*performance_key.*(?:does not exist|not found|schema cache)/i.test(error?.message || "");
    }

    function isMissingServiceDateColumn(error) {
        const message = error?.message || "";
        return /service_date/i.test(message)
            && (error?.code === "42703" || /does not exist|not found|schema cache/i.test(message));
    }

    function showServiceDateSchemaNotice() {
        showMessage("To use service dates, run the latest supabase/schema.sql in your Supabase SQL Editor. It adds the optional service_date column to worship_sets.", "info");
    }

    function formatServiceDate(serviceDate) {
        if (!serviceDate) return "";
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate);
        if (!match) return "Date unavailable";
        const [, year, month, day] = match;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        if (date.toISOString().slice(0, 10) !== serviceDate) return "Date unavailable";
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "full",
            timeZone: "UTC"
        }).format(date);
    }

    function friendlyError(error) {
        const message = error && typeof error.message === "string" ? error.message : "";
        const code = error && typeof error.code === "string" ? error.code : "";
        if (isMissingServiceDateColumn(error)) {
            return "Service dates are not enabled in the database yet. Run the latest supabase/schema.sql in your Supabase SQL Editor, then try again.";
        }
        if (/email.*rate limit|rate limit.*email/i.test(message) || /email.*rate.*limit/i.test(code)) {
            return "Supabase's built-in email service allows only 2 authentication emails per hour. Wait for the limit to reset, or configure custom SMTP in Supabase Dashboard → Authentication → SMTP Settings. If you already tried signing up, try signing in instead of creating the account again.";
        }
        if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
        if (/email not confirmed/i.test(message)) return "Please confirm your email before signing in.";
        if (/failed to fetch|network/i.test(message)) return "A network error occurred. Check your connection and try again.";
        if (/row-level security|permission denied/i.test(message)) return "You do not have permission to perform this action.";
        return message || "Something went wrong. Please try again.";
    }

    function requireClient() {
        if (!db) {
            throw new Error("Set up the Supabase project URL and public key in js/supabase.js before using the app.");
        }
        return db;
    }

    function validateUuid(id, entity) {
        if (typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
            throw new Error(`This ${entity} link is invalid.`);
        }
        return id;
    }

    async function getCurrentUser() {
        const client = requireClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return data.session?.user || null;
    }

    async function checkAuth() {
        if (!db) {
            showMessage("Connect Latreia to Supabase by setting the project URL and public publishable key in js/supabase.js.", "error");
            return false;
        }

        try {
            currentUser = await getCurrentUser();
        } catch (error) {
            showMessage(friendlyError(error));
            return false;
        }

        if (document.body.dataset.protected === "true" && !currentUser) {
            window.location.replace(`login.html?next=${encodeURIComponent(window.location.pathname.split("/").pop() || "index.html")}`);
            return false;
        }
        if ((page === "login" || page === "register") && currentUser) {
            window.location.replace("index.html");
            return false;
        }

        if (currentUser) {
            const { data: profile, error } = await db.from("profiles")
                .select("display_name")
                .eq("id", currentUser.id)
                .maybeSingle();
            if (error) {
                showMessage(friendlyError(error));
            } else {
                const displayName = profile?.display_name || currentUser.email || "Your account";
                document.querySelectorAll("#userDisplayName").forEach((element) => {
                    element.textContent = displayName;
                });
                document.querySelectorAll("#userAvatar").forEach((element) => {
                    element.textContent = displayName.trim().charAt(0).toUpperCase() || "L";
                });
            }
        }
        return true;
    }

    async function login(email, password) {
        const { error } = await requireClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async function register(displayName, email, password) {
        const emailRedirectTo = getAuthRedirectUrl();
        const { data, error } = await requireClient().auth.signUp({
            email,
            password,
            options: {
                data: { display_name: displayName },
                emailRedirectTo
            }
        });
        if (error) throw error;
        return data;
    }

    function getAuthRedirectUrl() {
        if (!["http:", "https:"].includes(window.location.protocol)) {
            throw new Error("Open Latreia from its Vercel URL before requesting an email confirmation.");
        }
        return new URL("/index.html", window.location.origin).href;
    }

    function getPasswordResetRedirectUrl() {
        if (!["http:", "https:"].includes(window.location.protocol)) {
            throw new Error("Open Latreia from its Vercel URL before requesting a password reset.");
        }
        return new URL("/reset-password.html", window.location.origin).href;
    }

    async function sendPasswordReset(email) {
        const { error } = await requireClient().auth.resetPasswordForEmail(email, {
            redirectTo: getPasswordResetRedirectUrl()
        });
        if (error) throw error;
    }

    async function resendConfirmation(email) {
        const { error } = await requireClient().auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: getAuthRedirectUrl() }
        });
        if (error) throw error;
    }

    async function logout() {
        const { error } = await requireClient().auth.signOut();
        if (error) throw error;
        window.location.replace("login.html");
    }

    async function getProfile() {
        if (!currentUser) throw new Error("Please sign in to continue.");
        const { data, error } = await requireClient().from("profiles")
            .select("*").eq("id", currentUser.id).single();
        if (error) throw error;
        return data;
    }

    async function updateProfile(fields) {
        if (!currentUser) throw new Error("Please sign in to continue.");
        const { data, error } = await requireClient().from("profiles")
            .update(fields).eq("id", currentUser.id).select().single();
        if (error) throw error;
        return data;
    }

    async function getSongs(search = "") {
        const client = requireClient();
        const query = search.trim();
        if (!query) {
            const { data, error } = await client.from("songs")
                .select("id, title, artist, language, original_key, chart, url, created_at, updated_at")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }

        const escaped = query.replace(/[%_\\]/g, "\\$&");
        const [titles, artists] = await Promise.all([
            client.from("songs").select("id, title, artist, language, original_key, chart, url, created_at, updated_at")
                .ilike("title", `%${escaped}%`),
            client.from("songs").select("id, title, artist, language, original_key, chart, url, created_at, updated_at")
                .ilike("artist", `%${escaped}%`)
        ]);
        if (titles.error) throw titles.error;
        if (artists.error) throw artists.error;
        const unique = new Map([...titles.data, ...artists.data].map((song) => [song.id, song]));
        return [...unique.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    async function getSongsPage(search, language, pageIndex) {
        const client = requireClient();
        let query = client.from("songs")
            .select("id, title, artist, language, original_key, created_at", { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: true });
        if (language) query = query.eq("language", language);
        if (search.trim()) {
            const escaped = search.trim().replace(/[%_\\"]/g, "\\$&");
            const pattern = `"%${escaped}%"`;
            query = query.or(`title.ilike.${pattern},artist.ilike.${pattern}`);
        }
        const from = pageIndex * SONGS_PER_PAGE;
        const { data, count, error } = await query.range(from, from + SONGS_PER_PAGE - 1);
        if (error) throw error;
        return { songs: data, count: count ?? 0 };
    }

    async function getSong(id) {
        validateUuid(id, "song");
        const { data, error } = await requireClient().from("songs")
            .select("id, user_id, title, artist, language, original_key, chart, url, created_at, updated_at")
            .eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Song not found, or you do not have access to it.");
        return data;
    }

    async function createSong(fields) {
        if (!currentUser) throw new Error("Please sign in to continue.");
        const { data, error } = await requireClient().from("songs")
            .insert({ ...fields, user_id: currentUser.id }).select("id").single();
        if (error) throw error;
        return data;
    }

    async function updateSong(id, fields) {
        validateUuid(id, "song");
        const { data, error } = await requireClient().from("songs")
            .update(fields).eq("id", id).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Song not found, or you do not have permission to edit it.");
        return data;
    }

    async function deleteSong(id) {
        validateUuid(id, "song");
        const { error, count } = await requireClient().from("songs")
            .delete({ count: "exact" }).eq("id", id);
        if (error) throw error;
        if (count === 0) throw new Error("Song not found, or you do not have permission to delete it.");
    }

    function displaySongs(songs, container) {
        container.replaceChildren();
        if (songs.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No songs found.";
            container.appendChild(empty);
            return;
        }
        songs.forEach((song) => {
            const card = document.createElement("article");
            card.className = "song-card";
            const info = document.createElement("div");
            info.className = "song-card-info";
            const title = document.createElement("h2");
            title.textContent = song.title;
            const artist = document.createElement("p");
            artist.className = "muted";
            artist.textContent = song.artist;
            info.append(title, artist);
            const key = document.createElement("span");
            key.className = "key-badge";
            key.textContent = song.original_key || "Key not set";
            const actions = document.createElement("div");
            actions.className = "card-actions";
            const view = document.createElement("a");
            view.className = "button button-primary button-small";
            view.href = `song.html?id=${encodeURIComponent(song.id)}`;
            view.textContent = "View";
            const edit = document.createElement("a");
            edit.className = "button button-secondary button-small";
            edit.href = `edit-song.html?id=${encodeURIComponent(song.id)}`;
            edit.textContent = "Edit";
            const remove = document.createElement("button");
            remove.className = "button button-danger button-small";
            remove.type = "button";
            remove.textContent = "Delete";
            remove.addEventListener("click", async () => {
                if (!window.confirm(`Delete “${song.title}”? It will also be removed from any worship sets.`)) return;
                remove.disabled = true;
                remove.textContent = "Deleting…";
                try {
                    await deleteSong(song.id);
                    showMessage("Song deleted.", "success");
                    await loadSongs();
                } catch (error) {
                    showMessage(friendlyError(error));
                    remove.disabled = false;
                    remove.textContent = "Delete";
                }
            });
            actions.append(view, edit, remove);
            card.append(info, key, actions);
            container.appendChild(card);
        });
    }

    function renderSongPagination(count, pageIndex) {
        const pagination = document.getElementById("songPagination");
        if (!pagination) return;
        pagination.replaceChildren();
        const pageCount = Math.ceil(count / SONGS_PER_PAGE);
        pagination.hidden = pageCount <= 1;
        if (pageCount <= 1) return;

        const addButton = (label, targetPage, disabled = false, current = false) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `page-button${current ? " is-current" : ""}`;
            button.textContent = label;
            button.disabled = disabled;
            if (current) button.setAttribute("aria-current", "page");
            button.addEventListener("click", () => {
                songPage = targetPage;
                void loadSongs();
            });
            pagination.appendChild(button);
        };

        addButton("Previous", pageIndex - 1, pageIndex === 0);
        const start = Math.max(0, Math.min(pageCount - 5, pageIndex - 2));
        const end = Math.min(pageCount, start + 5);
        for (let index = start; index < end; index += 1) {
            addButton(String(index + 1), index, false, index === pageIndex);
        }
        addButton("Next", pageIndex + 1, pageIndex >= pageCount - 1);
    }

    async function searchSongs(search, language, pageIndex, container) {
        const request = ++songPageRequest;
        const result = await getSongsPage(search, language, pageIndex);
        if (request !== songPageRequest) return;
        const lastPage = Math.max(0, Math.ceil(result.count / SONGS_PER_PAGE) - 1);
        if (pageIndex > lastPage) {
            songPage = lastPage;
            await loadSongs();
            return;
        }
        displaySongs(result.songs, container);
        const count = document.getElementById("songResultCount");
        if (count) count.textContent = `${result.count} ${result.count === 1 ? "song" : "songs"}`;
        renderSongPagination(result.count, pageIndex);
    }

    async function loadSongs() {
        const container = document.getElementById("songList");
        const search = document.getElementById("songSearch");
        if (!container) return;
        try {
            await searchSongs(
                search?.value || "",
                document.getElementById("songLanguageFilter")?.value || "",
                songPage,
                container
            );
        } catch (error) {
            container.replaceChildren();
            renderSongPagination(0, 0);
            showMessage(friendlyError(error));
        }
    }

    function detectKeyFromChart(chart) {
        const counts = new Map();
        const chordPattern = /\[([A-G](?:#|b)?)(?:[^\]]*)\]/g;
        let match;
        while ((match = chordPattern.exec(chart)) !== null) {
            const key = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            const index = KEY_INDEX.get(key);
            if (index !== undefined) counts.set(index, (counts.get(index) || 0) + 1);
        }
        if (!counts.size) return "";
        return KEY_NAMES[[...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]];
    }

    function isChartSectionLine(line) {
        return /^\s*\[?(?:Verse|Chorus|Pre[- ]?Chorus|Bridge|Intro|Outro|Interlude|Refrain|Hook|Ending|Break)(?:\s+\d+)?\]?:?\s*$/i.test(line);
    }

    function getChartSectionKind(line) {
        const name = line.trim().replace(/^\[|\]$/g, "").replace(/:$/, "").toLowerCase().replace(/[^a-z]/g, "");
        if (name.startsWith("intro") || name.startsWith("interlude")) return "intro";
        if (name.startsWith("verse")) return "verse";
        if (name.startsWith("prechorus") || name.startsWith("refrain") || name.startsWith("hook")) return "lift";
        if (name.startsWith("chorus")) return "chorus";
        if (name.startsWith("bridge") || name.startsWith("break")) return "bridge";
        return "outro";
    }

    function renderChartPreview(chart, target) {
        target.dataset.chartSource = String(chart || "");
        target.replaceChildren();
        const chartStyle = getComputedStyle(target);
        const probe = document.createElement("div");
        probe.className = "chart-line";
        probe.style.cssText = "position:absolute;width:1ch;padding:0;border:0;visibility:hidden;";
        target.appendChild(probe);
        const characterWidth = probe.getBoundingClientRect().width;
        probe.remove();
        const chartWidth = target.clientWidth;
        target.dataset.chartWidth = String(chartWidth);
        const contentWidth = chartWidth - parseFloat(chartStyle.paddingLeft) - parseFloat(chartStyle.paddingRight);
        const mobileColumns = window.matchMedia("(max-width: 760px)").matches && characterWidth > 0
            ? Math.max(8, Math.floor(contentWidth / characterWidth) - 3)
            : Infinity;
        if (typeof ResizeObserver !== "undefined" && !chartResizeObservers.has(target)) {
            const observer = new ResizeObserver(() => {
                if (target.clientWidth !== Number(target.dataset.chartWidth)) {
                    renderChartPreview(target.dataset.chartSource, target);
                }
            });
            observer.observe(target);
            chartResizeObservers.set(target, observer);
        }
        const lines = String(chart || "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
        let sectionNumber = 0;
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const row = document.createElement("div");
            row.className = "chart-line";
            if (isChartSectionLine(line)) {
                row.classList.add("chart-section-row");
                row.dataset.sectionKind = getChartSectionKind(line);
                if (target.id === "songChart") row.id = `song-section-${++sectionNumber}`;
                const section = document.createElement("strong");
                section.className = "chart-section-label";
                section.textContent = `[${line.trim().replace(/^\[|\]$/g, "").replace(/:$/, "")}]`;
                row.appendChild(section);
            } else {
                const chords = [];
                let lyrics = "";
                let sourceOffset = 0;
                const chordPattern = /\[([^\]]+)\]/g;
                let match;

                while ((match = chordPattern.exec(line)) !== null) {
                    const lyricSegment = line.slice(sourceOffset, match.index);
                    lyrics += lyricSegment;
                    chords.push({
                        name: match[1],
                        offset: [...lyrics].length,
                        gap: [...lyricSegment].length,
                        prefix: !lyrics.trim()
                    });
                    sourceOffset = match.index + match[0].length;
                }
                lyrics += line.slice(sourceOffset);
                let chordOnly = chords.length > 0 && (!lyrics.trim() || /^[-–—\s]+$/u.test(lyrics));
                if (chordOnly && lines[index + 1] && !/\[[^\]]+\]/.test(lines[index + 1])
                    && !isChartSectionLine(lines[index + 1])) {
                    lyrics = lines[index + 1];
                    index += 1;
                    chordOnly = false;
                }
                const leadingWhitespace = chords.length && !chordOnly
                    ? lyrics.match(/^\s*/u)?.[0] || ""
                    : "";
                const leadingOffset = [...leadingWhitespace].length;
                const visibleLyrics = lyrics.slice(leadingWhitespace.length);
                const prefixChordCount = chords.findIndex((chord) => !chord.prefix);
                const prefixCount = prefixChordCount === -1 ? chords.length : prefixChordCount;
                chords.forEach((chord, index) => {
                    if (index < prefixCount) {
                        chord.offset = index === 0
                            ? Math.max(0, chord.offset - leadingOffset)
                            : chords[index - 1].offset + [...chords[index - 1].name].length + Math.max(1, chord.gap);
                    } else {
                        chord.offset = Math.max(0, chord.offset - leadingOffset);
                    }
                });

                const lyricCharacters = Array.from(visibleLyrics);
                const segments = [];
                if (lyricCharacters.length > mobileColumns) {
                    let start = 0;
                    while (start < lyricCharacters.length) {
                        let end = Math.min(start + mobileColumns, lyricCharacters.length);
                        if (end < lyricCharacters.length) {
                            for (let split = end - 1; split > start; split -= 1) {
                                if (/\s/u.test(lyricCharacters[split])) {
                                    end = split + 1;
                                    break;
                                }
                            }
                        }
                        segments.push({ start, end });
                        start = end;
                    }
                } else {
                    segments.push({ start: 0, end: lyricCharacters.length });
                }
                if (chordOnly && chords.length && Number.isFinite(mobileColumns)) {
                    segments.length = 0;
                    let start = chords[0].offset;
                    let lastChord = chords[0];
                    chords.slice(1).forEach((chord) => {
                        if (chord.offset - start + [...chord.name].length > mobileColumns) {
                            segments.push({ start, end: chord.offset });
                            start = chord.offset;
                        }
                        lastChord = chord;
                    });
                    segments.push({ start, end: lastChord.offset + [...lastChord.name].length });
                }

                segments.forEach(({ start, end }, segmentIndex) => {
                    const segmentContent = document.createElement("div");
                    segmentContent.className = "chart-line-content";
                    const segmentChords = chords
                        .map((chord, chordIndex) => ({ ...chord, chordIndex }))
                        .filter(({ offset }) => offset >= start
                            && (offset < end || segmentIndex === segments.length - 1))
                        .map((chord) => ({ ...chord, offset: chord.offset - start }));

                    if (segmentChords.length) {
                        const lane = document.createElement("div");
                        lane.className = `chart-chord-lane${chordOnly ? " chart-chord-only" : ""}`;
                        const rowEnds = [];
                        const segmentPrefixChords = segmentChords.filter(({ chordIndex }) => chordIndex < prefixCount);
                        if (!chordOnly && segmentPrefixChords.length > 1) {
                            segmentPrefixChords.forEach(({ name, offset }) => {
                                rowEnds[0] = Math.max(rowEnds[0] || 0, offset + [...name].length + 1);
                            });
                        }

                        segmentChords.forEach(({ name, offset, chordIndex }) => {
                            let laneRow = 0;
                            if (!chordOnly && !(segmentPrefixChords.length > 1 && chordIndex < prefixCount)) {
                                laneRow = rowEnds.findIndex((rowEnd) => rowEnd <= offset);
                                if (laneRow === -1) laneRow = rowEnds.length;
                                rowEnds[laneRow] = offset + [...name].length + 1;
                            }

                            const chord = document.createElement("strong");
                            chord.className = "chart-chord";
                            chord.textContent = name;
                            chord.style.left = `calc(${offset}ch + 3px)`;
                            chord.style.top = `${laneRow * 1.35}em`;
                            lane.appendChild(chord);
                        });

                        lane.style.height = `${Math.max(1, rowEnds.length) * 1.35}em`;
                        if (chordOnly) {
                            const lastChord = segmentChords[segmentChords.length - 1];
                            lane.style.width = `${lastChord.offset + [...lastChord.name].length + 0.5}ch`;
                        }
                        segmentContent.appendChild(lane);
                    }

                    if (!chordOnly) {
                        const lyricRow = document.createElement("span");
                        lyricRow.className = "chart-lyrics";
                        lyricRow.textContent = lyricCharacters.slice(start, end).join("") || line;
                        segmentContent.appendChild(lyricRow);
                    }
                    row.appendChild(segmentContent);
                });
            }
            target.appendChild(row);
        }
        songSectionNavigationRefreshers.get(target)?.();
    }

    function initSongSectionNavigation(container) {
        const navigation = document.getElementById("songSectionNavigation");
        const links = document.getElementById("songSectionLinks");
        const toggle = document.getElementById("songSectionToggle");
        const nextSong = document.getElementById("nextSetSongFromChart");
        let activeSectionId = "";
        let observer = null;
        let navigationResizeObserver = null;
        const sectionSlots = [
            { kind: "verse", occurrence: 1, label: "Verse 1" },
            { kind: "verse", occurrence: 2, label: "Verse 2" },
            { kind: "chorus", occurrence: 1, label: "Chorus 1" },
            { kind: "chorus", occurrence: 2, label: "Chorus 2" },
            { kind: "bridge", occurrence: 1, label: "Bridge 1" },
            { kind: "bridge", occurrence: 2, label: "Bridge 2" }
        ];

        function updateSectionScrollMargins(sections) {
            const styles = getComputedStyle(navigation);
            const stickyTop = Number.parseFloat(styles.top) || 0;
            const scrollMargin = Math.ceil(navigation.getBoundingClientRect().height + stickyTop + 16);
            sections.forEach((section) => {
                section.style.setProperty("--song-section-scroll-margin", `${scrollMargin}px`);
            });
        }

        function markActive(sectionId) {
            activeSectionId = sectionId;
            links.querySelectorAll(".song-section-link").forEach((button) => {
                if (button.dataset.sectionId === sectionId) {
                    button.setAttribute("aria-current", "location");
                } else {
                    button.removeAttribute("aria-current");
                }
            });
        }

        toggle.addEventListener("click", () => {
            links.hidden = !links.hidden;
            toggle.setAttribute("aria-expanded", String(!links.hidden));
            toggle.textContent = links.hidden ? "Show sections" : "Hide sections";
            updateSectionScrollMargins(Array.from(container.querySelectorAll(".chart-section-row[id]")));
        });

        links.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-section-id]");
            if (!button || !links.contains(button)) return;
            const section = document.getElementById(button.dataset.sectionId);
            if (!section) return;
            markActive(section.id);
            section.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start"
            });
        });

        songSectionNavigationRefreshers.set(container, () => {
            observer?.disconnect();
            const sections = Array.from(container.querySelectorAll(".chart-section-row[id]"));
            const sectionOccurrences = new Map();
            const availableSections = new Map();
            sections.forEach((section) => {
                const kind = section.dataset.sectionKind;
                const occurrence = (sectionOccurrences.get(kind) || 0) + 1;
                sectionOccurrences.set(kind, occurrence);
                if (occurrence <= 2 && ["verse", "chorus", "bridge"].includes(kind)) {
                    availableSections.set(`${kind}-${occurrence}`, section);
                }
            });
            const navigableSections = sectionSlots
                .map((slot) => ({ ...slot, section: availableSections.get(`${slot.kind}-${slot.occurrence}`) }))
                .filter((slot) => slot.section);
            links.replaceChildren();
            navigableSections.forEach(({ kind, label, section }) => {
                const button = document.createElement("button");
                button.className = "song-section-link";
                button.type = "button";
                button.dataset.sectionId = section.id;
                button.dataset.sectionKind = kind;
                button.textContent = label;
                links.appendChild(button);
            });
            toggle.hidden = navigableSections.length === 0;
            updateSectionScrollMargins(sections);
            navigation.hidden = navigableSections.length === 0 && nextSong.hidden;
            if (navigation.hidden) {
                activeSectionId = "";
                return;
            }
            if (typeof ResizeObserver !== "undefined" && !navigationResizeObserver) {
                navigationResizeObserver = new ResizeObserver(() => {
                    updateSectionScrollMargins(Array.from(container.querySelectorAll(".chart-section-row[id]")));
                });
                navigationResizeObserver.observe(navigation);
            }
            markActive(navigableSections.some(({ section }) => section.id === activeSectionId)
                ? activeSectionId
                : navigableSections[0]?.section.id || "");

            if (typeof IntersectionObserver !== "undefined") {
                observer = new IntersectionObserver(() => {
                    const visible = navigableSections.map(({ section }) => section)
                        .filter((section) => {
                            const bounds = section.getBoundingClientRect();
                            return bounds.top <= window.innerHeight * 0.3
                                && bounds.bottom >= window.innerHeight * 0.1;
                        })
                        .sort((first, second) => first.getBoundingClientRect().top - second.getBoundingClientRect().top);
                    if (visible.length) markActive(visible[0].id);
                }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });
                navigableSections.forEach(({ section }) => observer.observe(section));
            }
        });
    }

    function initSongSidebar() {
        const shell = document.getElementById("songAppShell");
        const sidebar = document.getElementById("songSidebar");
        const toggle = document.getElementById("sidebarToggle");
        const backdrop = document.getElementById("sidebarBackdrop");
        if (!shell || !sidebar || !toggle || !backdrop) return;

        const setOpen = (open) => {
            shell.classList.toggle("sidebar-open", open);
            sidebar.inert = !open;
            sidebar.setAttribute("aria-hidden", String(!open));
            toggle.setAttribute("aria-expanded", String(open));
            toggle.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar");
            toggle.textContent = open ? "×" : "☰";
            backdrop.hidden = !open;
            if (!open) toggle.focus();
        };

        toggle.addEventListener("click", () => {
            setOpen(toggle.getAttribute("aria-expanded") !== "true");
        });
        backdrop.addEventListener("click", () => setOpen(false));
        sidebar.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => setOpen(false));
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && shell.classList.contains("sidebar-open")) {
                setOpen(false);
            }
        });
    }

    function updateSongPreview() {
        const title = document.getElementById("editorTitle");
        const artist = document.getElementById("editorArtist");
        const key = document.getElementById("editorKey");
        const chart = document.getElementById("editorChart");
        const titlePreview = document.getElementById("previewTitle");
        const artistPreview = document.getElementById("previewArtist");
        const keyPreview = document.getElementById("previewKey");
        const chartPreview = document.getElementById("previewChart");
        if (!title || !artist || !key || !chart || !chartPreview) return;
        if (titlePreview) titlePreview.textContent = title.value.trim() || "Song title";
        if (artistPreview) artistPreview.textContent = artist.value.trim() || "Artist";
        if (keyPreview) keyPreview.textContent = key.value || "Not set";
        renderChartPreview(chart.value, chartPreview);
    }

    function updateImportPreview() {
        updateSongPreview();
    }

    function renderSongPreview() {
        updateSongPreview();
    }

    function fillKeyOptions(select) {
        select.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Not set";
        select.appendChild(empty);
        KEY_OPTIONS.forEach((key) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key;
            select.appendChild(option);
        });
    }

    function validateSongFields(form) {
        const fields = {
            title: form.elements.title.value.trim(),
            artist: form.elements.artist.value.trim(),
            language: form.elements.language.value,
            original_key: form.elements.original_key.value || null,
            chart: form.elements.chart.value,
            url: form.elements.url.value.trim() || null
        };
        if (!fields.title) throw new Error("Enter a song title.");
        if (!fields.artist) throw new Error("Enter an artist.");
        if (!["Tagalog", "English"].includes(fields.language)) throw new Error("Choose Tagalog or English for the song language.");
        if (!fields.chart.trim()) throw new Error("Enter a song chart.");
        if (fields.url) {
            try {
                const parsed = new URL(fields.url);
                if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
            } catch {
                throw new Error("Enter a valid source URL, or leave it blank.");
            }
        }
        return fields;
    }

    async function importSong(url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error("The URL you entered is not valid.");
        }
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
        const response = await fetch("/api/import-song", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: parsed.href })
        });
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error(response.status === 403
                ? "The importer is unavailable here. Run the site with Vercel CLI or deploy it to Vercel."
                : "The importer returned an invalid response.");
        }
        if (!response.ok || !result.success) throw new Error(result.error || "The song could not be imported.");
        return result;
    }

    function showImportPreview(song) {
        const editor = document.getElementById("songEditor");
        const start = document.getElementById("importStart");
        if (!editor || !start) return;
        document.getElementById("editorTitle").value = song.title || "";
        document.getElementById("editorArtist").value = song.artist || "";
        const importedKey = song.key || detectKeyFromChart(song.chart || "");
        document.getElementById("editorKey").value = KEY_OPTIONS.includes(importedKey) ? importedKey : "";
        originalKeyLocked = Boolean(song.key);
        document.getElementById("editorUrl").value = song.url || "";
        document.getElementById("editorChart").value = song.chart || "";
        document.getElementById("editorEyebrow").textContent = "IMPORT PREVIEW · EDIT BEFORE SAVING";
        document.getElementById("editorHeading").textContent = "Review imported song";
        document.getElementById("saveSongButton").textContent = "Save song";
        document.getElementById("cancelEditor").hidden = false;
        document.getElementById("cancelEditor").textContent = "Cancel Import";
        start.hidden = true;
        editor.hidden = false;
        updateImportPreview();
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function cancelImport() {
        const form = document.getElementById("songForm");
        const importForm = document.getElementById("importForm");
        const editor = document.getElementById("songEditor");
        const start = document.getElementById("importStart");
        if (form) form.reset();
        if (importForm) importForm.reset();
        if (editor) editor.hidden = true;
        if (start) start.hidden = false;
        originalKeyLocked = false;
        const cancelButton = document.getElementById("cancelEditor");
        if (cancelButton) cancelButton.textContent = "Cancel Import";
        clearMessage();
    }

    function setButtonLoading(button, loading, text, originalText) {
        button.disabled = loading;
        button.textContent = loading ? text : originalText;
    }

    async function initSongEditor(editing) {
        const form = document.getElementById("songForm");
        const editor = document.getElementById("songEditor");
        const start = document.getElementById("importStart");
        const key = document.getElementById("editorKey");
        fillKeyOptions(key);
        originalKeyLocked = false;

        ["editorTitle", "editorArtist", "editorChart"].forEach((id) => {
            document.getElementById(id).addEventListener("input", updateSongPreview);
        });
        key.addEventListener("change", () => {
            originalKeyLocked = Boolean(key.value);
            updateSongPreview();
        });
        document.getElementById("editorChart").addEventListener("input", (event) => {
            if (!originalKeyLocked) {
                const detected = detectKeyFromChart(event.currentTarget.value);
                if (detected && KEY_OPTIONS.includes(detected)) key.value = detected;
            }
            updateSongPreview();
        });

        if (editing) {
            editor.hidden = false;
            start?.remove();
            document.getElementById("editorEyebrow")?.remove();
            document.getElementById("editorHeading")?.remove();
            const id = new URLSearchParams(window.location.search).get("id");
            showMessage("Loading song details…", "info");
            try {
                const song = await getSong(id);
                clearMessage();
                form.elements.title.value = song.title;
                form.elements.artist.value = song.artist;
                form.elements.language.value = song.language || "English";
                form.elements.original_key.value = song.original_key || "";
                originalKeyLocked = Boolean(song.original_key);
                form.elements.chart.value = song.chart;
                form.elements.url.value = song.url || "";
                updateSongPreview();
            } catch (error) {
                showMessage(friendlyError(error));
                form.querySelectorAll("input, select, textarea, button").forEach((element) => {
                    element.disabled = true;
                });
            }
        } else {
            editor.hidden = true;
        }

        document.getElementById("manualSongButton")?.addEventListener("click", () => {
            start.hidden = true;
            editor.hidden = false;
            document.getElementById("editorEyebrow").textContent = "NEW SONG";
            document.getElementById("editorHeading").textContent = "Enter song details";
            document.getElementById("saveSongButton").textContent = "Save song";
            document.getElementById("cancelEditor").textContent = "Cancel";
            document.getElementById("cancelEditor").hidden = false;
            updateSongPreview();
        });

        document.getElementById("cancelEditor")?.addEventListener("click", cancelImport);

        document.getElementById("importForm")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = event.currentTarget.querySelector("button[type=submit]");
            const originalText = button.textContent;
            setButtonLoading(button, true, "Importing…", originalText);
            try {
                const result = await importSong(document.getElementById("importUrl").value.trim());
                showImportPreview(result);
            } catch (error) {
                showMessage(friendlyError(error));
            } finally {
                setButtonLoading(button, false, "", originalText);
            }
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = document.getElementById("saveSongButton");
            const originalText = button.textContent;
            setButtonLoading(button, true, editing ? "Saving…" : "Saving…", originalText);
            try {
                const fields = validateSongFields(form);
                const songId = new URLSearchParams(window.location.search).get("id");
                if (editing) {
                    await updateSong(songId, fields);
                    window.location.assign(`song.html?id=${encodeURIComponent(songId)}`);
                } else {
                    const saved = await createSong(fields);
                    showMessage("Song saved successfully!", "success");
                    window.location.assign(`song.html?id=${encodeURIComponent(saved.id)}`);
                }
            } catch (error) {
                showMessage(friendlyError(error));
                setButtonLoading(button, false, "", originalText);
            }
        });
        updateSongPreview();
    }

    function transposeNote(note, semitones) {
        const normalized = note.charAt(0).toUpperCase() + note.slice(1);
        const index = KEY_INDEX.get(normalized);
        if (index === undefined) return note;
        const shifted = (index + semitones % 12 + 12) % 12;
        return note.includes("b") ? FLAT_KEYS[shifted] : KEY_NAMES[shifted];
    }

    function transposeChord(chord, semitones) {
        const match = chord.match(/^([A-Ga-g](?:#|b)?)(.*)$/);
        if (!match) return chord;
        const suffix = match[2];
        const slashIndex = suffix.indexOf("/");
        if (slashIndex < 0) return transposeNote(match[1], semitones) + suffix;
        const quality = suffix.slice(0, slashIndex + 1);
        const bass = suffix.slice(slashIndex + 1);
        const bassMatch = bass.match(/^([A-Ga-g](?:#|b)?)(.*)$/);
        if (!bassMatch) return transposeNote(match[1], semitones) + suffix;
        return transposeNote(match[1], semitones) + quality
            + transposeNote(bassMatch[1], semitones) + bassMatch[2];
    }

    function transposeChart(chart, semitones) {
        return chart.replace(/\[([^\]]+)\]/g, (_whole, chord) => `[${transposeChord(chord, semitones)}]`);
    }

    function getCurrentKey(originalKey, amount) {
        if (!originalKey || !KEY_INDEX.has(originalKey)) return "—";
        const index = (KEY_INDEX.get(originalKey) + amount % 12 + 12) % 12;
        return originalKey.includes("b") ? FLAT_KEYS[index] : KEY_NAMES[index];
    }

    async function initSetSongNavigation(setId, songId) {
        const navigation = document.getElementById("setSongNavigation");
        const set = await getSet(setId);
        let { data, error } = await requireClient().from("set_songs")
            .select("position, performance_key, songs(id, title)")
            .eq("set_id", setId).order("position", { ascending: true });
        if (isMissingPerformanceKeyColumn(error)) {
            showMessage("Run the setlist performance-key SQL migration in Supabase to enable saved keys.");
            ({ data, error } = await requireClient().from("set_songs")
                .select("position, songs(id, title)")
                .eq("set_id", setId).order("position", { ascending: true }));
        }
        if (error) throw error;

        const songs = data
            .map((row) => ({ ...row, song: Array.isArray(row.songs) ? row.songs[0] : row.songs }))
            .filter((row) => row.song)
        const index = songs.findIndex((item) => item.song.id === songId);
        if (index < 0) {
            showMessage("This song is no longer in the selected worship set.");
            return;
        }

        const makeSongUrl = (id) => `song.html?id=${encodeURIComponent(id)}&set=${encodeURIComponent(setId)}`;
        const backLink = document.getElementById("setSongBack");
        const position = document.getElementById("setSongPosition");
        const previous = document.getElementById("previousSetSong");
        const next = document.getElementById("nextSetSong");
        const nextBottom = document.getElementById("nextSetSongBottom");
        const nextFromChart = document.getElementById("nextSetSongFromChart");
        const bottomNavigation = document.getElementById("setSongBottomNavigation");

        backLink.href = `set.html?id=${encodeURIComponent(setId)}`;
        backLink.textContent = `← ${set.name}`;
        position.textContent = `Song ${index + 1} of ${songs.length}`;

        [[previous, songs[index - 1]], [next, songs[index + 1]], [nextBottom, songs[index + 1]], [nextFromChart, songs[index + 1]]].forEach(([link, adjacent]) => {
            if (adjacent) {
                link.href = makeSongUrl(adjacent.song.id);
                link.removeAttribute("aria-disabled");
                link.classList.remove("is-disabled");
            } else {
                link.removeAttribute("href");
                link.setAttribute("aria-disabled", "true");
                link.classList.add("is-disabled");
            }
        });
        nextFromChart.hidden = !songs[index + 1];
        navigation.hidden = false;
        bottomNavigation.hidden = false;
        return songs[index].performance_key;
    }

    async function initSongViewer() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        const setId = params.get("set");
        const container = document.getElementById("songChart");
        initSongSectionNavigation(container);
        if (!id) {
            showMessage("This song link is missing an ID.");
            container.replaceChildren();
            return;
        }
        try {
            const song = await getSong(id);
            document.title = `${song.title} · Latreia`;
            document.getElementById("songTitle").textContent = song.title;
            document.getElementById("songArtist").textContent = song.artist;
            document.getElementById("originalKey").textContent = song.original_key || "Not set";
            document.getElementById("editSongLink").href = `edit-song.html?id=${encodeURIComponent(song.id)}`;
            const source = document.getElementById("songSource");
            if (song.url) {
                const link = document.createElement("a");
                link.href = song.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "Open source chart ↗";
                source.appendChild(link);
            }
            let setPerformanceKey = "";
            if (setId) {
                try {
                    setPerformanceKey = await initSetSongNavigation(setId, song.id) || "";
                } catch (error) {
                    showMessage(friendlyError(error));
                }
            }
            let amount = 0;
            const baseKey = setPerformanceKey && KEY_INDEX.has(setPerformanceKey)
                ? setPerformanceKey
                : song.original_key;
            const baseShift = baseKey && KEY_INDEX.has(baseKey) && song.original_key && KEY_INDEX.has(song.original_key)
                ? (KEY_INDEX.get(baseKey) - KEY_INDEX.get(song.original_key) + 12) % 12
                : 0;
            const draw = () => {
                document.getElementById("currentKey").textContent = getCurrentKey(baseKey, amount);
                renderChartPreview(transposeChart(song.chart, baseShift + amount), container);
            };
            document.getElementById("transposeDown").addEventListener("click", () => { amount -= 1; draw(); });
            document.getElementById("transposeUp").addEventListener("click", () => { amount += 1; draw(); });
            document.getElementById("resetKey").addEventListener("click", () => { amount = 0; draw(); });
            draw();
        } catch (error) {
            showMessage(friendlyError(error));
            container.replaceChildren();
        }
    }

    async function getSets() {
        const client = requireClient();
        const { data, error } = await client.from("worship_sets")
            .select("id, name, description, service_date, created_at, updated_at, set_songs(count), set_musicians(position, musician)")
            .order("updated_at", { ascending: false });
        if (isMissingServiceDateColumn(error)) {
            showServiceDateSchemaNotice();
            const fallback = await client.from("worship_sets")
                .select("id, name, description, created_at, updated_at, set_songs(count), set_musicians(position, musician)")
                .order("updated_at", { ascending: false });
            if (fallback.error) throw fallback.error;
            return fallback.data.map((set) => ({ ...set, service_date: null }));
        }
        if (error) throw error;
        return data;
    }

    async function getSet(id) {
        validateUuid(id, "worship set");
        const client = requireClient();
        const { data, error } = await client.from("worship_sets")
            .select("id, user_id, name, description, service_date, created_at, updated_at")
            .eq("id", id).maybeSingle();
        if (isMissingServiceDateColumn(error)) {
            showServiceDateSchemaNotice();
            const fallback = await client.from("worship_sets")
                .select("id, user_id, name, description, created_at, updated_at")
                .eq("id", id).maybeSingle();
            if (fallback.error) throw fallback.error;
            if (!fallback.data) throw new Error("Worship set not found, or you do not have access to it.");
            return { ...fallback.data, service_date: null };
        }
        if (error) throw error;
        if (!data) throw new Error("Worship set not found, or you do not have access to it.");
        return data;
    }

    async function createSet(fields) {
        if (!currentUser) throw new Error("Please sign in to continue.");
        const values = { ...fields, user_id: currentUser.id };
        if (!values.service_date) delete values.service_date;
        const { data, error } = await requireClient().from("worship_sets")
            .insert(values).select("id").single();
        if (error) throw error;
        return data;
    }

    async function updateSet(id, fields) {
        validateUuid(id, "worship set");
        const values = { ...fields };
        if (!values.service_date) delete values.service_date;
        const { data, error } = await requireClient().from("worship_sets")
            .update(values).eq("id", id).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Worship set not found, or you do not have permission to edit it.");
        return data;
    }

    async function getSetMusicians(setId) {
        validateUuid(setId, "worship set");
        const { data, error } = await requireClient().from("set_musicians")
            .select("position, musician").eq("set_id", setId);
        if (error) throw error;
        return data;
    }

    async function saveSetMusicians(setId, musicians) {
        validateUuid(setId, "worship set");
        const rows = MUSICIAN_POSITIONS.map((position) => ({
            set_id: setId,
            position,
            musician: musicians[position].trim()
        }));
        const assigned = rows.filter((row) => row.musician);
        const unassigned = rows.filter((row) => !row.musician).map((row) => row.position);
        const client = requireClient();

        if (assigned.length) {
            const { error } = await client.from("set_musicians")
                .upsert(assigned, { onConflict: "set_id,position" });
            if (error) throw error;
        }
        const { error } = await client.from("set_musicians")
            .delete().eq("set_id", setId).in("position", unassigned);
        if (error) throw error;
    }

    async function deleteSet(id) {
        validateUuid(id, "worship set");
        const { error, count } = await requireClient().from("worship_sets")
            .delete({ count: "exact" }).eq("id", id);
        if (error) throw error;
        if (count === 0) throw new Error("Worship set not found, or you do not have permission to delete it.");
    }

    async function addSongToSet(setId, songId) {
        validateUuid(setId, "worship set");
        validateUuid(songId, "song");
        const client = requireClient();
        const { data: last, error: readError } = await client.from("set_songs")
            .select("position").eq("set_id", setId).order("position", { ascending: false }).limit(1);
        if (readError) throw readError;
        const position = last.length ? last[0].position + 1 : 0;
        const { error } = await client.from("set_songs").insert({ set_id: setId, song_id: songId, position });
        if (error) {
            if (error.code === "23505") throw new Error("That song is already in this set.");
            throw error;
        }
    }

    async function removeSongFromSet(setSongId) {
        validateUuid(setSongId, "set song");
        const { error, count } = await requireClient().from("set_songs")
            .delete({ count: "exact" }).eq("id", setSongId);
        if (error) throw error;
        if (count === 0) throw new Error("Song was not found in this set.");
    }

    async function reorderSetSongs(rows, fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= rows.length || fromIndex === toIndex) return;
        const reordered = [...rows];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        for (let index = 0; index < reordered.length; index += 1) {
            const { error } = await requireClient().from("set_songs")
                .update({ position: index }).eq("id", reordered[index].id);
            if (error) throw error;
        }
        return reordered;
    }

    async function loadSets() {
        const container = document.getElementById("setList");
        container.innerHTML = '<p class="empty-state">Loading worship sets…</p>';
        try {
            const sets = await getSets();
            container.replaceChildren();
            if (sets.length === 0) {
                const empty = document.createElement("p");
                empty.className = "empty-state";
                empty.textContent = "No worship sets yet. Create one to plan a service.";
                container.appendChild(empty);
                return;
            }
            sets.forEach((set) => {
                const card = document.createElement("article");
                card.className = "set-card";
                const title = document.createElement("h2");
                title.textContent = set.name;
                const description = document.createElement("p");
                description.className = "muted";
                description.textContent = set.description || "No description";
                const serviceDate = document.createElement("p");
                serviceDate.className = "set-service-date";
                serviceDate.textContent = set.service_date
                    ? `Service date · ${formatServiceDate(set.service_date)}`
                    : "Service date not set";
                const count = document.createElement("span");
                count.className = "set-song-count";
                const songCount = set.set_songs?.[0]?.count || 0;
                count.textContent = `${songCount} ${songCount === 1 ? "song" : "songs"}`;
                const musicianSection = document.createElement("div");
                musicianSection.className = "set-card-musicians";
                const musicianHeading = document.createElement("strong");
                musicianHeading.textContent = "Scheduled musicians";
                const musicianList = document.createElement("ul");
                const musicians = set.set_musicians || [];
                if (musicians.length) {
                    musicians.forEach(({ position, musician }) => {
                        const item = document.createElement("li");
                        const musicianName = document.createElement("span");
                        musicianName.textContent = position;
                        const musicianPosition = document.createElement("strong");
                        musicianPosition.textContent = musician;
                        item.append(musicianName, musicianPosition);
                        musicianList.appendChild(item);
                    });
                } else {
                    const empty = document.createElement("li");
                    empty.className = "muted";
                    empty.textContent = "No musicians scheduled";
                    musicianList.appendChild(empty);
                }
                musicianSection.append(musicianHeading, musicianList);
                const actions = document.createElement("div");
                actions.className = "card-actions";
                const open = document.createElement("a");
                open.className = "button button-primary button-small";
                open.href = `set.html?id=${encodeURIComponent(set.id)}`;
                open.textContent = "Open";
                const edit = document.createElement("a");
                edit.className = "button button-secondary button-small";
                edit.href = `create-set.html?id=${encodeURIComponent(set.id)}`;
                edit.textContent = "Edit";
                const remove = document.createElement("button");
                remove.className = "button button-danger button-small";
                remove.type = "button";
                remove.textContent = "Delete";
                remove.addEventListener("click", async () => {
                    if (!window.confirm(`Delete the worship set “${set.name}”? Its song links will be removed, but the songs remain in your library.`)) return;
                    remove.disabled = true;
                    remove.textContent = "Deleting…";
                    try {
                        await deleteSet(set.id);
                        showMessage("Worship set deleted.", "success");
                        await loadSets();
                    } catch (error) {
                        showMessage(friendlyError(error));
                        remove.disabled = false;
                        remove.textContent = "Delete";
                    }
                });
                actions.append(open, edit, remove);
                card.append(title, description, serviceDate, count, musicianSection, actions);
                container.appendChild(card);
            });
        } catch (error) {
            container.replaceChildren();
            showMessage(friendlyError(error));
        }
    }

    async function initSetForm() {
        const form = document.getElementById("setForm");
        const id = new URLSearchParams(window.location.search).get("id");
        if (id) {
            document.getElementById("setFormHeading").textContent = "Edit worship set";
            showMessage("Loading set details…", "info");
            try {
                const set = await getSet(id);
                const musicians = await getSetMusicians(id);
                clearMessage();
                form.elements.name.value = set.name;
                form.elements.service_date.value = set.service_date || "";
                form.elements.description.value = set.description || "";
                musicians.forEach(({ position, musician }) => {
                    const field = form.elements[`musician-${position.toLowerCase().replace(/ /g, "-")}`];
                    if (field) field.value = musician;
                });
                form.querySelector('button[type="submit"]').textContent = "Save changes";
            } catch (error) {
                showMessage(friendlyError(error));
                form.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = true; });
            }
        }
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = form.querySelector('button[type="submit"]');
            const original = button.textContent;
            setButtonLoading(button, true, "Saving…", original);
            try {
                const fields = {
                    name: form.elements.name.value.trim(),
                    service_date: form.elements.service_date.value || null,
                    description: form.elements.description.value.trim()
                };
                if (!fields.name) throw new Error("Enter a set name.");
                const musicians = Object.fromEntries(MUSICIAN_POSITIONS.map((position) => [
                    position,
                    form.elements[`musician-${position.toLowerCase().replace(/ /g, "-")}`].value
                ]));
                let setId = id;
                if (id) {
                    await updateSet(id, fields);
                } else {
                    const set = await createSet(fields);
                    setId = set.id;
                }
                await saveSetMusicians(setId, musicians);
                window.location.assign(`set.html?id=${encodeURIComponent(setId)}`);
            } catch (error) {
                showMessage(friendlyError(error));
                setButtonLoading(button, false, "", original);
            }
        });
    }

    async function initSetViewer() {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) {
            showMessage("This set link is missing an ID.");
            return;
        }
        const list = document.getElementById("setSongList");
        const searchInput = document.getElementById("songSearchInput");
        const searchResults = document.getElementById("songSearchResults");
        let rows = [];
        let searchRequest = 0;
        let performanceKeyAvailable = true;
        const renderRows = () => {
            list.replaceChildren();
            if (!rows.length) {
                const empty = document.createElement("li");
                empty.className = "empty-state";
                empty.textContent = "No songs in this set yet. Add songs from your library above.";
                list.appendChild(empty);
                return;
            }
            rows.forEach((row, index) => {
                const item = document.createElement("li");
                item.className = "set-song-row";
                const position = document.createElement("span");
                position.className = "song-position";
                position.textContent = String(index + 1).padStart(2, "0");
                const info = document.createElement("div");
                info.className = "set-song-info";
                const title = document.createElement("strong");
                title.textContent = row.songs.title;
                const artist = document.createElement("span");
                artist.className = "muted";
                artist.textContent = `${row.songs.artist} · ${row.songs.original_key || "Key not set"}`;
                info.append(title, artist);
                const keyControl = document.createElement("div");
                keyControl.className = "set-song-key-control";
                const keyLabel = document.createElement("label");
                keyLabel.textContent = "Play in";
                const keySelect = document.createElement("select");
                keySelect.className = "set-song-key";
                keySelect.setAttribute("aria-label", `Performance key for ${row.songs.title}`);
                const originalOption = document.createElement("option");
                originalOption.value = "";
                originalOption.textContent = row.songs.original_key
                    ? `Original (${row.songs.original_key})`
                    : "Original key";
                keySelect.appendChild(originalOption);
                KEY_OPTIONS.forEach((key) => {
                    const option = document.createElement("option");
                    option.value = key;
                    option.textContent = key;
                    keySelect.appendChild(option);
                });
                keySelect.value = row.performance_key || "";
                keySelect.disabled = !performanceKeyAvailable;
                const keyStatus = document.createElement("span");
                keyStatus.className = "set-song-key-status";
                keyStatus.setAttribute("aria-live", "polite");
                if (!performanceKeyAvailable) keyStatus.textContent = "Run Supabase SQL setup";
                keyControl.append(keyLabel, keySelect, keyStatus);
                info.appendChild(keyControl);
                keySelect.addEventListener("change", async () => {
                    const previousKey = row.performance_key || "";
                    keySelect.disabled = true;
                    keyStatus.textContent = "Saving…";
                    try {
                        await updateSetSongKey(row.id, keySelect.value);
                        row.performance_key = keySelect.value || null;
                        keyStatus.textContent = "Saved";
                        window.setTimeout(() => { keyStatus.textContent = ""; }, 1800);
                    } catch (error) {
                        keySelect.value = previousKey;
                        keyStatus.textContent = "";
                        showMessage(friendlyError(error));
                    } finally {
                        keySelect.disabled = false;
                    }
                });
                const actions = document.createElement("div");
                actions.className = "card-actions";
                const view = document.createElement("a");
                view.className = "button button-primary button-small";
                view.href = `song.html?id=${encodeURIComponent(row.songs.id)}&set=${encodeURIComponent(id)}`;
                view.textContent = "Open song";
                const up = document.createElement("button");
                up.className = "button button-secondary button-small";
                up.type = "button";
                up.textContent = "↑";
                up.disabled = index === 0;
                up.setAttribute("aria-label", `Move ${row.songs.title} up`);
                const down = document.createElement("button");
                down.className = "button button-secondary button-small";
                down.type = "button";
                down.textContent = "↓";
                down.disabled = index === rows.length - 1;
                down.setAttribute("aria-label", `Move ${row.songs.title} down`);
                const remove = document.createElement("button");
                remove.className = "button button-danger button-small";
                remove.type = "button";
                remove.textContent = "Remove";
                up.addEventListener("click", () => move(index, index - 1));
                down.addEventListener("click", () => move(index, index + 1));
                remove.addEventListener("click", async () => {
                    if (!window.confirm(`Remove “${row.songs.title}” from this set? The song stays in your library.`)) return;
                    remove.disabled = true;
                    try {
                        await removeSongFromSet(row.id);
                        rows.splice(index, 1);
                        rows.forEach((itemRow, position) => { itemRow.position = position; });
                        renderRows();
                    } catch (error) {
                        showMessage(friendlyError(error));
                        remove.disabled = false;
                    }
                });
                actions.append(view, up, down, remove);
                item.append(position, info, actions);
                list.appendChild(item);
            });
        };
        const move = async (from, to) => {
            list.querySelectorAll("button").forEach((button) => { button.disabled = true; });
            try {
                rows = (await reorderSetSongs(rows, from, to)) || rows;
                renderRows();
            } catch (error) {
                showMessage(friendlyError(error));
                await loadSetSongs();
            }
        };
        const loadSetSongs = async () => {
            let { data, error } = await requireClient().from("set_songs")
                .select("id, position, performance_key, songs(id, title, artist, original_key)")
                .eq("set_id", id).order("position", { ascending: true });
            if (isMissingPerformanceKeyColumn(error)) {
                performanceKeyAvailable = false;
                showMessage("To save a key for a song in this set, run this in Supabase SQL Editor: alter table public.set_songs add column if not exists performance_key text;");
                ({ data, error } = await requireClient().from("set_songs")
                    .select("id, position, songs(id, title, artist, original_key)")
                    .eq("set_id", id).order("position", { ascending: true }));
            }
            if (error) throw error;
            rows = data.filter((row) => row.songs).map((row) => ({ ...row, songs: Array.isArray(row.songs) ? row.songs[0] : row.songs }));
            renderRows();
        };
        try {
            const set = await getSet(id);
            document.title = `${set.name} · Latreia`;
            document.getElementById("setTitle").textContent = set.name;
            const serviceDate = document.getElementById("setServiceDate");
            serviceDate.textContent = set.service_date
                ? `Service date · ${formatServiceDate(set.service_date)}`
                : "Service date not set";
            document.getElementById("setDescription").textContent = set.description || "";
            document.getElementById("editSetLink").href = `create-set.html?id=${encodeURIComponent(id)}`;
            document.getElementById("editSetScheduleLink").href = `create-set.html?id=${encodeURIComponent(id)}`;
            const schedule = document.getElementById("setMusicianSchedule");
            const musicians = await getSetMusicians(id);
            const assigned = new Map(musicians.map(({ position, musician }) => [position, musician]));
            schedule.replaceChildren();
            MUSICIAN_POSITIONS.forEach((position) => {
                const row = document.createElement("div");
                const label = document.createElement("dt");
                label.textContent = position;
                const value = document.createElement("dd");
                value.textContent = assigned.get(position) || "—";
                row.append(label, value);
                schedule.appendChild(row);
            });
            await loadSetSongs();

            const renderSearchResults = (songs) => {
                searchResults.replaceChildren();
                const availableSongs = songs.filter((song) => !rows.some((row) => row.songs.id === song.id));
                if (!availableSongs.length) {
                    const empty = document.createElement("p");
                    empty.className = "search-prompt";
                    empty.textContent = songs.length ? "All matching songs are already in this set." : "No matching songs found.";
                    searchResults.appendChild(empty);
                    return;
                }
                availableSongs.forEach((song) => {
                    const result = document.createElement("div");
                    result.className = "song-search-result";
                    result.setAttribute("role", "listitem");
                    const info = document.createElement("div");
                    info.className = "song-search-result-info";
                    const title = document.createElement("strong");
                    title.textContent = song.title;
                    const detail = document.createElement("span");
                    detail.className = "muted";
                    detail.textContent = `${song.artist} · ${song.original_key || "Key not set"}`;
                    info.append(title, detail);
                    const addButton = document.createElement("button");
                    addButton.className = "button button-primary button-small";
                    addButton.type = "button";
                    addButton.textContent = "Add";
                    addButton.addEventListener("click", async () => {
                        addButton.disabled = true;
                        addButton.textContent = "Adding…";
                        try {
                            await addSongToSet(id, song.id);
                            await loadSetSongs();
                            searchResults.replaceChildren();
                            const query = searchInput.value.trim();
                            if (query) await searchLibrary(query);
                            else searchResults.innerHTML = '<p class="search-prompt">Type a song title or artist to search your library.</p>';
                        } catch (error) {
                            showMessage(friendlyError(error));
                            addButton.disabled = false;
                            addButton.textContent = "Add";
                        }
                    });
                    result.append(info, addButton);
                    searchResults.appendChild(result);
                });
            };
            const searchLibrary = async (query) => {
                const request = ++searchRequest;
                if (!query) {
                    searchResults.innerHTML = '<p class="search-prompt">Type a song title or artist to search your library.</p>';
                    return;
                }
                searchResults.innerHTML = '<p class="search-prompt">Searching your library…</p>';
                try {
                    const songs = await getSongs(query);
                    if (request === searchRequest) renderSearchResults(songs);
                } catch (error) {
                    if (request === searchRequest) {
                        searchResults.replaceChildren();
                        showMessage(friendlyError(error));
                    }
                }
            };
            searchInput.addEventListener("input", () => {
                void searchLibrary(searchInput.value.trim());
            });
            document.getElementById("deleteSetButton").addEventListener("click", async (event) => {
                const button = event.currentTarget;
                if (!window.confirm(`Delete “${set.name}”? Songs will remain in your library.`)) return;
                const original = button.textContent;
                setButtonLoading(button, true, "Deleting…", original);
                try {
                    await deleteSet(id);
                    window.location.assign("sets.html");
                } catch (error) {
                    showMessage(friendlyError(error));
                    setButtonLoading(button, false, "", original);
                }
            });
        } catch (error) {
            showMessage(friendlyError(error));
            list.replaceChildren();
        }
    }

    async function loadDashboardStats() {
        const client = requireClient();
        const [songsResult, setsResult] = await Promise.all([
            client.from("songs").select("id", { count: "exact", head: true }),
            client.from("worship_sets").select("id", { count: "exact", head: true })
        ]);
        if (songsResult.error) throw songsResult.error;
        if (setsResult.error) throw setsResult.error;
        document.getElementById("songCount").textContent = songsResult.count ?? 0;
        document.getElementById("setCount").textContent = setsResult.count ?? 0;

        const dialog = document.getElementById("dashboardModal");
        const title = document.getElementById("dashboardModalTitle");
        const content = document.getElementById("dashboardModalContent");
        document.getElementById("dashboardModalClose").addEventListener("click", () => dialog.close());
        document.getElementById("songCountTrigger").addEventListener("click", () => {
            title.textContent = "Total songs";
            content.replaceChildren();
            const total = document.createElement("p");
            total.className = "modal-total";
            total.textContent = `${songsResult.count ?? 0} ${songsResult.count === 1 ? "song" : "songs"} in your library`;
            content.appendChild(total);
            dialog.showModal();
        });
        document.getElementById("setCountTrigger").addEventListener("click", async () => {
            title.textContent = "Worship sets";
            content.innerHTML = '<p class="empty-state">Loading your sets…</p>';
            dialog.showModal();
            try {
                const sets = await getSets();
                content.replaceChildren();
                if (!sets.length) {
                    const empty = document.createElement("p");
                    empty.className = "empty-state";
                    empty.textContent = "No worship sets yet.";
                    content.appendChild(empty);
                    return;
                }
                sets.forEach((set) => {
                    const item = document.createElement("article");
                    item.className = "dashboard-set";
                    const heading = document.createElement("h3");
                    heading.textContent = set.name;
                    const details = document.createElement("p");
                    details.className = "muted";
                    const date = new Date(set.created_at);
                    const dateText = Number.isNaN(date.getTime())
                        ? "Date unavailable"
                        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
                    const songCount = set.set_songs?.[0]?.count || 0;
                    const serviceDateText = set.service_date
                        ? `Service date · ${formatServiceDate(set.service_date)}`
                        : "Service date not set";
                    details.textContent = `${serviceDateText} · Created ${dateText} · ${songCount} ${songCount === 1 ? "song" : "songs"}`;
                    item.append(heading, details);
                    const musicians = (set.set_musicians || []).filter((row) => row.musician);
                    const schedule = document.createElement("p");
                    schedule.className = "dashboard-set-musicians";
                    schedule.textContent = musicians.length
                        ? musicians.map(({ position, musician }) => `${position}: ${musician}`).join(" · ")
                        : "No musicians scheduled";
                    item.appendChild(schedule);
                    content.appendChild(item);
                });
            } catch (error) {
                content.replaceChildren();
                const message = document.createElement("p");
                message.className = "empty-state";
                message.textContent = friendlyError(error);
                content.appendChild(message);
            }
        });
    }

    async function loadMostPlayedSong() {
        const { data, error } = await requireClient().from("set_songs")
            .select("song_id, songs(id, title, artist)");
        if (error) throw error;
        const plays = new Map();
        data.forEach((row) => {
            const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
            if (!song) return;
            const current = plays.get(song.id) || { ...song, count: 0 };
            current.count += 1;
            plays.set(song.id, current);
        });
        const title = document.getElementById("mostPlayedTitle");
        const count = document.getElementById("mostPlayedCount");
        const mostPlayed = [...plays.values()]
            .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))[0];
        if (!mostPlayed) {
            title.textContent = "No plays yet";
            count.textContent = "Add songs to a worship set to start tracking.";
            return;
        }
        title.textContent = mostPlayed.title;
        count.textContent = `${mostPlayed.count} ${mostPlayed.count === 1 ? "use" : "uses"} in worship sets`;
    }

    async function loadRecentSongs() {
        const container = document.getElementById("recentSongs");
        const { songs } = await getSongsPage("", "", 0);
        displaySongs(songs.slice(0, 6), container);
    }

    async function initDashboard() {
        try {
            await Promise.all([loadDashboardStats(), loadRecentSongs(), loadMostPlayedSong()]);
        } catch (error) {
            showMessage(friendlyError(error));
        }
    }

    async function initLogin() {
        const form = document.getElementById("loginForm");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = form.querySelector('button[type="submit"]');
            const original = button.textContent;
            setButtonLoading(button, true, "Signing in…", original);
            try {
                await login(form.elements.email.value.trim(), form.elements.password.value);
                const next = new URLSearchParams(window.location.search).get("next");
                const allowed = ["index.html", "songs.html", "add-song.html", "edit-song.html", "song.html", "sets.html", "create-set.html", "set.html"];
                window.location.assign(allowed.includes(next) ? next : "index.html");
            } catch (error) {
                showMessage(friendlyError(error));
                setButtonLoading(button, false, "", original);
            }
        });

        document.getElementById("resendConfirmationButton")?.addEventListener("click", async (event) => {
            clearMessage();
            const email = form.elements.email.value.trim();
            if (!email) {
                showMessage("Enter your email address first.");
                form.elements.email.focus();
                return;
            }
            const button = event.currentTarget;
            const original = button.textContent;
            setButtonLoading(button, true, "Sending…", original);
            try {
                await resendConfirmation(email);
                showMessage("If that account needs confirmation, Supabase has sent a fresh confirmation email.", "success");
            } catch (error) {
                showMessage(friendlyError(error));
            } finally {
                setButtonLoading(button, false, "", original);
            }
        });
    }

    function initForgotPassword() {
        const form = document.getElementById("forgotPasswordForm");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = form.querySelector('button[type="submit"]');
            const original = button.textContent;
            setButtonLoading(button, true, "Sending…", original);
            try {
                await sendPasswordReset(form.elements.email.value.trim());
                showMessage("If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.", "success");
            } catch (error) {
                showMessage(friendlyError(error));
            } finally {
                setButtonLoading(button, false, "", original);
            }
        });
    }

    function initResetPassword() {
        const form = document.getElementById("resetPasswordForm");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = form.querySelector('button[type="submit"]');
            const original = button.textContent;
            const password = form.elements.password.value;
            if (password !== form.elements.confirmPassword.value) {
                showMessage("The new passwords do not match.");
                form.elements.confirmPassword.focus();
                return;
            }

            setButtonLoading(button, true, "Updating password…", original);
            try {
                const { error } = await requireClient().auth.updateUser({ password });
                if (error) throw error;
                window.location.assign("index.html");
            } catch (error) {
                showMessage(friendlyError(error));
                setButtonLoading(button, false, "", original);
            }
        });
    }

    async function initRegister() {
        const form = document.getElementById("registerForm");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage();
            const button = form.querySelector('button[type="submit"]');
            const original = button.textContent;
            setButtonLoading(button, true, "Creating account…", original);
            try {
                const displayName = form.elements.displayName.value.trim();
                const password = form.elements.password.value;
                if (password !== form.elements.confirmPassword.value) throw new Error("Passwords do not match.");
                const result = await register(displayName, form.elements.email.value.trim(), password);
                if (result.session) {
                    window.location.assign("index.html");
                } else {
                    showMessage("Account created. Check your email to confirm your address, then sign in.", "success");
                    setButtonLoading(button, false, "", original);
                }
            } catch (error) {
                showMessage(friendlyError(error));
                setButtonLoading(button, false, "", original);
            }
        });
    }

    function initThemeToggle() {
        const root = document.documentElement;
        const storedTheme = localStorage.getItem("setchord-theme");
        let theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
        root.dataset.theme = theme;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-secondary theme-toggle theme-toggle-floating";
        const icon = document.createElement("span");
        icon.className = "theme-toggle-icon";
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "theme-toggle-label";
        button.append(icon, label);
        const updateButton = () => {
            const nextTheme = theme === "dark" ? "light" : "dark";
            icon.textContent = theme === "dark" ? "☼" : "☾";
            label.textContent = theme === "dark" ? "Light mode" : "Dark mode";
            button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
            button.setAttribute("aria-pressed", String(theme === "light"));
        };
        updateButton();
        button.addEventListener("click", () => {
            theme = theme === "dark" ? "light" : "dark";
            root.dataset.theme = theme;
            localStorage.setItem("setchord-theme", theme);
            updateButton();
        });

        document.body.appendChild(button);
    }

    function bindSharedEvents() {
        document.getElementById("logoutButton")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await logout();
            } catch (error) {
                showMessage(friendlyError(error));
                button.disabled = false;
            }
        });
        const refreshSongPage = () => {
            songPage = 0;
            void loadSongs();
        };
        document.getElementById("songSearch")?.addEventListener("input", refreshSongPage);
        document.getElementById("songLanguageFilter")?.addEventListener("change", refreshSongPage);
    }

    async function initialize() {
        initThemeToggle();
        bindSharedEvents();
        if (page === "song") initSongSidebar();
        const authenticated = await checkAuth();
        if (!authenticated) {
            if (page === "login" && db) initLogin();
            if (page === "register" && db) initRegister();
            if (page === "forgot-password" && db) initForgotPassword();
            return;
        }

        switch (page) {
            case "dashboard": await initDashboard(); break;
            case "songs": await loadSongs(); break;
            case "add-song": await initSongEditor(false); break;
            case "edit-song": await initSongEditor(true); break;
            case "song": await initSongViewer(); break;
            case "sets": await loadSets(); break;
            case "create-set": await initSetForm(); break;
            case "set": await initSetViewer(); break;
            case "login": initLogin(); break;
            case "register": initRegister(); break;
            case "forgot-password": initForgotPassword(); break;
            case "reset-password": initResetPassword(); break;
            default: break;
        }
    }

    initialize().catch((error) => showMessage(friendlyError(error)));
})();
