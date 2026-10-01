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

    window.dispatchEvent(
        new CustomEvent("downloadQueued")
    );
});


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
