import {
    addToQueue,
    removeFromQueue,
    getQueue,
    downloadAll
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

queueDownload.addEventListener("click", async () => {
    try {
        await downloadAll();
    } catch (error) {
        console.error("Download All error:", error);
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
   DOWNLOAD QUEUED
   ========================= */

window.addEventListener("downloadQueued", () => {
    navigateTo("home");
});


/* =========================
   RENDER QUEUE
   ========================= */

function renderQueue() {
    const queue = getQueue();

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
            </div>

            <button class="queue-remove" data-id="${item.id}">
                ×
            </button>
        `;

        queueList.appendChild(element);
    });
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
