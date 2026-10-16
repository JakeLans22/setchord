import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../js/supabase.js";
import "../js/app.js";

const legacyContent = document.createElement("div");
legacyContent.innerHTML = document.body.innerHTML;
legacyContent.querySelectorAll("script").forEach((script) => script.remove());

const rootElement = document.createElement("div");
rootElement.id = "root";
document.body.replaceChildren(rootElement);

const root = createRoot(rootElement);
flushSync(() => {
    root.render(
        <div dangerouslySetInnerHTML={{ __html: legacyContent.innerHTML }} />
    );
});

window.initializeLatreia();
