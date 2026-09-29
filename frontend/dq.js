const queue = [];

export async function addToQueue(download) {
    const alreadyQueued = queue.some(
        item => item.url === download.url
    );

    if (alreadyQueued) {
        return false;
    }

    const item = {
        id: crypto.randomUUID(),
        ...download,
        status: "queued"
    };

    queue.push(item);

    window.dispatchEvent(
        new CustomEvent("queueUpdated", {
            detail: [...queue]
        })
    );

    await window.pywebview.api.add_to_queue(item);

    return item.id;
}

export async function removeFromQueue(id) {
    const index = queue.findIndex(item => item.id === id);

    if (index === -1) return;

    await window.pywebview.api.remove_from_queue(id);

    queue.splice(index, 1);

    window.dispatchEvent(
        new CustomEvent("queueUpdated", {
            detail: [...queue]
        })
    );
}

export function getQueue() {
    return [...queue];
}

export function clearQueue() {
    queue.length = 0;

    window.dispatchEvent(
        new CustomEvent("queueUpdated", {
            detail: []
        })
    );
}

export function updateQueueItem(id, updates){
    const item = queue.find(item => item.id === id)
    if (!item) return;
    Object.assign(item,updates);

    window.dispatchEvent(
        new CustomEvent("queueUpdated",{
            detail: [...queue]
        })
    )
}

export async function downloadAll() {
    await window.pywebview.api.start_downloads();
}