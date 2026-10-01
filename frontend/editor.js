// import dq.js;
// import { addToQueue } from "./dq.js";

import { updateQueueItem } from "./dq.js";
import { navigateTo, getCurrentScreen } from "./navigation.js";

const app = document.getElementById("app");
const input = document.querySelector("#input-bar input");
const button = document.querySelector("#startBT");
const results = document.querySelector("#results");
const reportUrl = document.querySelector("#report-url")
const loader = document.querySelector("#loader");
const home = document.querySelector("#home");
const errorBtn = document.querySelector("#error-ok")
const dropdown = document.getElementById("dropdown");
const downBtn = document.getElementById("downBT");
const downloadModal = document.getElementById("download-modal");
const downloadStatus = document.getElementById("download-status");
const downloadPercent = document.getElementById("download-percent");
const progressFill = document.getElementById("progress-fill");
const downloadInfo = document.getElementById("download-info");
const downloadOk = document.getElementById("download-ok");
const logo = document.getElementById("logo");

button.addEventListener("click", async () => {
    if (input.value === "") return;

    navigateTo("loading");

    setTimeout(async () => {
        try {
            await fetch_info();
            await new Promise(r => setTimeout(r, 400));

            reportUrl.textContent = input.value;
            navigateTo("results");

        } catch(err) {
            navigateTo("home");
            console.error(err);
            showError("Failed to fetch metadata");
        }
    }, 400);
});



logo.addEventListener("click", () => {
    if (getCurrentScreen() === "results") navigateTo("home");
});


errorBtn.addEventListener("click", () => {
    navigateTo("home");
    input.value = "";
    document.querySelector("#error-modal").hidden = true;

});


downBtn.addEventListener("click", async () => {
    const selected = dropdown.options[dropdown.selectedIndex];

    const formatId = selected.value;
    const formatType = selected.dataset.type;

    showDownloadModal();
    startProgressPolling();

    try {
        const success = await downloadFile(formatId, formatType);

        stopProgressPolling();

        if (success) {
            completeDownload();
        } else {
            setVisible(downloadModal, false);
            showError("Download failed");
        }

    } catch (error) {
        stopProgressPolling();

        console.error(error);
        setVisible(downloadModal, false);
        showError("Download failed");
    }
});


function setVisible(el, visible) {
    if (visible) {
        el.classList.remove("is-hidden");
        requestAnimationFrame(() => {
            el.classList.remove("fade-out");
        });
    } else {
        el.classList.add("fade-out");
        el.addEventListener("transitionend", () => {
            el.classList.add("is-hidden");
        }, { once: true });
    }
}

function showError(message){
    document.querySelector("#error-msg").textContent = message;
    document.querySelector("#error-modal").hidden = false;
}



async function fetch_info(){
    const url = input.value;
    const data = await window.pywebview.api.get_video_info(url);
    const formats = data.formats;
    selectQuality(formats);
    document.getElementById("title").textContent = data.title;
    document.getElementById("dur").textContent = "Duration: "+formatDuration(data.duration);
    if (data.thumbnail){
        document.getElementById("thumb").src = data.thumbnail;
    }
    console.log(data);
}


function formatDuration(seconds){
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${secs.toString().padStart(2,"0")}`;
}


function selectQuality(formats){
    dropdown.innerHTML = ""
    for (const format of formats) {
        const option = document.createElement("option");

        option.value = format.format_id;
        option.dataset.type = format.type;
        option.textContent = format.label
        dropdown.appendChild(option);
    }

}

async function downloadFile(formatId, formatType) {
    const url = input.value;
    const uid = crypto.randomUUID();

    return await window.pywebview.api.download(
        uid,
        url,
        formatId,
        formatType
    );
}


let progressTimer;

function startProgressPolling() {
    progressTimer = setInterval(async () => {
        try {
            const progress = await window.pywebview.api.get_progress();
            for (const [uid,data] of Object.entries(progress)){
                updateQueueItem(uid,data);

                if (data.status === "downloading"){
                    updateDownloadProgress(
                        data.percent,
                        data.speed,
                        data.eta
                    );

                }
            }

            
        } catch (error) {
            console.error("Progress error:", error);
        }
    }, 100);
}

function stopProgressPolling() {
    clearInterval(progressTimer);
}


function updateDownloadProgress(percent, speed, eta) {
    downloadPercent.textContent = percent;
    progressFill.style.width = percent;
    downloadInfo.textContent = `${speed} • ETA ${eta}`;
}

function showDownloadModal() {
    downloadStatus.textContent = "Downloading";
    downloadPercent.textContent = "0%";
    progressFill.style.width = "0%";
    downloadInfo.textContent = "Preparing...";
    
    downloadOk.disabled = true;

    setVisible(downloadModal, true);
}

function completeDownload() {
    downloadStatus.textContent = "Download Complete";
    downloadPercent.textContent = "100%";
    progressFill.style.width = "100%";
    downloadInfo.textContent = "Saved to Downloads";

    downloadOk.disabled = false;
}

downloadOk.addEventListener("click", () => {
    setVisible(downloadModal, false);
});

window.addEventListener("downloadQueued", () => {
    setVisible(downloadModal, false);
    navigateTo("home");
});