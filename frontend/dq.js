const queue = [];

export function addToQueue(download) {
    queue.push(download);

    window.dispatchEvent(
        new CustomEvent("queueUpdated", {
            detail: [...queue]
        })
    );
}

export function removeFromQueue(index) {
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