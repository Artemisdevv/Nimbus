import {
    addToQueue,
    removeFromQueue,
    getQueue,
    downloadAll,
    updateQueueItem
} from "./dq.js";
import { navigateTo } from "./navigation.js";


const queueModal = document.getElementById("queue-modal");
const queueList = document.getElementById("queue-list");
const queueCount = document.getElementById("queue-count");
const queueBadge = document.getElementById("queue-badge");

const openQueueBT = document.getElementById("openQueueBT");
const queueClose = document.getElementById("queue-close");
const queueDownload = document.getElementById("queue-download");

const input = document.querySelector("#input-bar input");
const dropdown = document.getElementById("dropdown");

const title = document.getElementById("title");
const thumb = document.getElementById("thumb");

const queueToast = document.getElementById("queue-toast");


/* =========================
   OPEN / CLOSE QUEUE
   ========================= */

openQueueBT.addEventListener("click", () => {
    queueModal.classList.remove("is-hidden");

    requestAnimationFrame(() => {
        queueModal.classList.remove("fade-out");
    });

    renderQueue();
});

let progressPollTimer = null;

function startQueueProgressPolling() {
    if (progressPollTimer) return; // already running

    progressPollTimer = setInterval(async () => {
        try {
            const progress = await window.pywebview.api.get_progress();
            window.__nimbusProgressMap = progress;

            for (const [uid, data] of Object.entries(progress)) {
                updateQueueItem(uid, data);
            }

            // Stop polling when queue is empty or all items completed/error
            const queue = getQueue();
            const allDone = queue.length === 0 || queue.every(item => {
                const p = progress[item.id];
                return p && (p.status === "completed" || p.status === "error");
            });

            if (allDone) {
                stopQueueProgressPolling();
            }
        } catch (error) {
            console.error("Queue progress polling error:", error);
        }
    }, 100);
}

function stopQueueProgressPolling() {
    if (progressPollTimer) {
        clearInterval(progressPollTimer);
        progressPollTimer = null;
    }
}

queueDownload.addEventListener("click", async () => {
    try {
        startQueueProgressPolling();
        await downloadAll();
    } catch (error) {
        console.error("Download All error:", error);
        stopQueueProgressPolling();
    }
});

queueClose.addEventListener("click", () => {
    queueModal.classList.add("fade-out");

    queueModal.addEventListener("transitionend", () => {
        queueModal.classList.add("is-hidden");
    }, { once: true });
});


/* =========================
   ADD TO QUEUE
   ========================= */

const queueBT = document.getElementById("queueBT");

queueBT.addEventListener("click", async () => {
    const selected = dropdown.options[dropdown.selectedIndex];

    if (!selected || !selected.value) {
        return;
    }

    const download = {
        url: input.value,
        format_id: selected.value,
        format_type: selected.dataset.type,
        title: title.textContent,
        thumbnail: thumb.src
    };

    const added = await addToQueue(download);

    if (!added) {
        showQueueToast("This video is already in the queue");
        return;
    }

    showQueueToast("Added to queue");

    // Animate thumbnail to queue button (fire-and-forget; never blocks queue/navigation)
    animateThumbnailToQueue(thumb, openQueueBT).catch(() => { /* ignore animation errors */ });

    window.dispatchEvent(
        new CustomEvent("downloadQueued")
    );
});


/* =========================
   THUMBNAIL FLY ANIMATION
   ========================= */

function animateThumbnailToQueue(thumbEl, targetEl) {
    return new Promise((resolve) => {
        if (!thumbEl || !targetEl) {
            resolve();
            return;
        }

        const thumbRect = thumbEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // If either element is not visible or has no size, skip animation
        if (thumbRect.width === 0 || thumbRect.height === 0 || targetRect.width === 0 || targetRect.height === 0) {
            resolve();
            return;
        }

        // Create ghost element
        const ghost = thumbEl.cloneNode(true);
        ghost.id = "";
        ghost.style.cssText = `
            position: fixed;
            left: ${thumbRect.left}px;
            top: ${thumbRect.top}px;
            width: ${thumbRect.width}px;
            height: ${thumbRect.height}px;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px var(--accent-glow, var(--accent));
            z-index: 9999;
            pointer-events: none;
            transition: none;
            opacity: 1;
        `;
        // Preserve aspect ratio during animation
        ghost.style.objectFit = "cover";

        document.body.appendChild(ghost);

        // Force reflow to ensure initial position is applied
        ghost.getBoundingClientRect();

        // Target position (center of queue button)
        const targetX = targetRect.left + targetRect.width / 2 - thumbRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2 - thumbRect.height / 2;

        // Animate using Web Animations API for smooth easing
        // Continuous aggressive shrink: 1.0 -> 0.65 -> 0.35 -> 0.15 -> 0.07 (5-10% of original)
        const animation = ghost.animate([
            { transform: "translate(0, 0) scale(1)",   opacity: 1,   offset: 0 },
            { transform: `translate(${ (targetX - thumbRect.left) * 0.25 }px, ${ (targetY - thumbRect.top) * 0.25 }px) scale(0.65)`, opacity: 0.95, offset: 0.15 },
            { transform: `translate(${ (targetX - thumbRect.left) * 0.55 }px, ${ (targetY - thumbRect.top) * 0.55 }px) scale(0.35)`, opacity: 0.8,  offset: 0.4 },
            { transform: `translate(${ (targetX - thumbRect.left) * 0.8 }px, ${ (targetY - thumbRect.top) * 0.8 }px) scale(0.15)`, opacity: 0.4,  offset: 0.7 },
            { transform: `translate(${targetX - thumbRect.left}px, ${targetY - thumbRect.top}px) scale(0.07)`, opacity: 0,   offset: 1 }
        ], {
            duration: 800,
            easing: "cubic-bezier(0.35, 0, 0.25, 1)", // Smooth continuous deceleration
            fill: "forwards"
        });

        animation.onfinish = () => {
            ghost.remove();
            resolve();
        };

        animation.oncancel = () => {
            ghost.remove();
            resolve();
        };

        // Safety timeout in case animation events don't fire
        setTimeout(() => {
            if (ghost.isConnected) ghost.remove();
            resolve();
        }, 800);
    });
}


/* =========================
   QUEUE UPDATED
   ========================= */

window.addEventListener("queueUpdated", () => {
    renderQueue();
});





/* =========================
   RENDER QUEUE
   ========================= */

function renderQueue() {
    const queue = getQueue();
    const progressMap = getProgressMap();

    // Compute overall summary
    const { total, completed, overallPct, curSpeed, curEta, dlBytes, totalBytes } = computeSummary(queue, progressMap);

    // Update summary bar (create once)
    if (!document.getElementById("queue-summary")) {
        injectSummaryBar();
    }
    updateSummaryUI(total, completed, overallPct, curSpeed, curEta, dlBytes, totalBytes);

    queueList.innerHTML = "";
    queueCount.textContent = `${queue.length} in queue`;

    queueBadge.textContent = queue.length;
    queueDownload.disabled = queue.length === 0;

    if (queue.length === 0) {
        queueList.innerHTML = `
            <div class="queue-empty">
                No downloads in queue
            </div>
        `;

        return;
    }

    queue.forEach((item, index) => {
        const element = document.createElement("div");
        element.className = "queue-item";
        element.dataset.id = item.id;

        const p = progressMap[item.id];
        const status = p ? p.status : (item.status || "queued");
        element.dataset.status = status;

        const progressHtml = (status === "downloading" && p && p.percent) ? `
            <div class="item-progress">
                <div class="item-progress-fill" style="width:${p.percent}"></div>
            </div>
            <span class="item-percent">${p.percent}</span>
        ` : (status === "processing" ? `
            <div class="item-progress indeterminate"><div class="item-progress-fill"></div></div>
            <span class="item-percent">Processing…</span>
        ` : status === "completed" ? `
            <span class="item-percent completed">✔ Completed</span>
        ` : `
            <span class="item-percent waiting">Waiting</span>
        `);

        element.innerHTML = `
            <img
                class="queue-thumb"
                src="${item.thumbnail}"
                alt=""
            >

            <div class="queue-details">
                <div class="queue-title">
                    ${escapeHTML(item.title)}
                </div>

                <div class="queue-format">
                    ${escapeHTML(item.formatid)}
                </div>

                ${progressHtml}
            </div>

            <button class="queue-remove" data-id="${item.id}" aria-label="Remove">
                ×
            </button>
        `;

        queueList.appendChild(element);
    });
}

/* =========================
   PROGRESS MAP HELPER
   ========================= */

function getProgressMap() {
    // progress map is kept in editor.js via polling; expose via window for now
    return window.__nimbusProgressMap || {};
}

/* =========================
   SUMMARY BAR INJECTION
   ========================= */

function injectSummaryBar() {
    const summary = document.createElement("div");
    summary.id = "queue-summary";
    summary.innerHTML = `
        <div class="summary-content">
            <div class="summary-row">
                <span id="overall-text">0 of 0 completed</span>
            </div>
            <div id="overall-progress" class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div id="overall-fill" class="progress-fill"></div>
            </div>
            <div id="live-stats" class="live-stats">
                <span id="live-speed">—</span>
                <span id="live-eta">—</span>
                <span id="live-bytes">—</span>
            </div>
        </div>
        <button id="queue-download" disabled>Download All</button>
    `;
    // Insert after header, before list
    const header = document.getElementById("queue-header");
    header.insertAdjacentElement("afterend", summary);
}

/* =========================
   SUMMARY UI UPDATE
   ========================= */

function updateSummaryUI(total, completed, overallPct, curSpeed, curEta, dlBytes, totalBytes) {
    const overallText = document.getElementById("overall-text");
    const overallFill = document.getElementById("overall-fill");
    const liveSpeed = document.getElementById("live-speed");
    const liveEta = document.getElementById("live-eta");
    const liveBytes = document.getElementById("live-bytes");
    const overallBar = document.getElementById("overall-progress");

    if (overallText) overallText.textContent = `${completed} of ${total} completed`;
    if (overallFill) overallFill.style.width = `${overallPct}%`;
    if (overallBar) overallBar.setAttribute("aria-valuenow", Math.round(overallPct));
    if (liveSpeed) liveSpeed.textContent = curSpeed || "—";
    if (liveEta) liveEta.textContent = curEta || "—";
    if (liveBytes) liveBytes.textContent = formatBytesLine(dlBytes, totalBytes);
}

/* =========================
   SUMMARY COMPUTATION
   ========================= */

function computeSummary(queue, progressMap) {
    const total = queue.length;
    let completed = 0;
    let curSpeed = "—";
    let curEta = "—";
    let dlBytes = 0;
    let totalBytes = 0;

    for (const item of queue) {
        const p = progressMap[item.id];
        if (p) {
            if (p.status === "completed") completed++;
            const tb = Number(p.total_bytes) || 0;
            const db = Number(p.downloaded_bytes) || 0;
            totalBytes += tb;
            dlBytes += db;
            if (p.status === "downloading") {
                curSpeed = p.speed || "—";
                curEta = p.eta || "—";
            }
        }
    }

    const overallPct = total ? (completed / total) * 100 : 0;
    return { total, completed, overallPct, curSpeed, curEta, dlBytes, totalBytes };
}

/* =========================
   BYTES FORMATTING
   ========================= */

function formatBytesLine(downloaded, total) {
    if (!total) return "—";
    const fmt = (b) => {
        if (b >= 1024**3) return (b/1024**3).toFixed(2) + " GiB";
        if (b >= 1024**2) return (b/1024**2).toFixed(2) + " MiB";
        if (b >= 1024) return (b/1024).toFixed(1) + " KiB";
        return b + " B";
    };
    return `${fmt(downloaded)} / ${fmt(total)}`;
}


/* =========================
   REMOVE ITEM
   ========================= */

queueList.addEventListener("click", async (event) => {
    const button = event.target.closest(".queue-remove");

    if (!button) return;

    const id = button.dataset.id;

    await removeFromQueue(id);
});


/* =========================
   BASIC HTML ESCAPING
   ========================= */

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function showQueueToast(message) {
    queueToast.textContent = message;
    queueToast.classList.add("show");

    setTimeout(() => {
        queueToast.classList.remove("show");
    }, 2500);
}
