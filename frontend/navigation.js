/**
 * Primary screen navigation manager.
 * Owns: home, loading, results screens only.
 * Modals (download, queue, error) remain independent.
 */

const FADE_DURATION_MS = 300;

const home = document.getElementById("home");
const loader = document.getElementById("loader");
const results = document.getElementById("results");
const inputBar = document.querySelector("#input-bar");
const startBT = document.getElementById("startBT");
const app = document.getElementById("app");

let currentScreen = "home";

function setVisible(el, visible) {
    if (visible) {
        // Cancel any pending hide transitionend that would re-add is-hidden
        if (el._hideTransitionEnd) {
            el.removeEventListener("transitionend", el._hideTransitionEnd);
            el._hideTransitionEnd = null;
        }
        el.classList.remove("is-hidden");
        requestAnimationFrame(() => {
            el.classList.remove("fade-out");
        });
    } else {
        el.classList.add("fade-out");
        const onEnd = () => {
            el.classList.add("is-hidden");
            el._hideTransitionEnd = null;
        };
        el._hideTransitionEnd = onEnd;
        el.addEventListener("transitionend", onEnd, { once: true });
    }
}

function hideAllPrimary() {
    const elems = [home, loader, results, inputBar, startBT];
    for (const el of elems) {
        if (!el.classList.contains("is-hidden")) {
            setVisible(el, false);
        }
    }
    app.classList.remove("hidden-card");
    results.classList.remove("show");
    document.body.classList.remove("results-mode");
}

export function navigateTo(screen) {
    if (screen === currentScreen) return;

    // Exit current screen
    switch (currentScreen) {
        case "results":
            // Results needs fade-out + timeout before next screen
            results.classList.remove("show");
            // Wait for fade-out to complete before showing next
            setTimeout(() => {
                hideAllPrimary();
                showScreen(screen);
            }, FADE_DURATION_MS);
            currentScreen = "transitioning";
            return;

        case "loading":
            hideAllPrimary();
            break;

        case "home":
            hideAllPrimary();
            break;
    }

    showScreen(screen);
}

function showScreen(screen) {
    switch (screen) {
        case "home":
            setVisible(home, true);
            setVisible(inputBar, true);
            setVisible(startBT, true);
            document.body.classList.remove("results-mode");
            currentScreen = "home";
            break;

        case "loading":
            app.classList.add("hidden-card");
            setVisible(loader, true);
            currentScreen = "loading";
            break;

        case "results":
            setVisible(results, true);
            document.body.classList.add("results-mode");
            requestAnimationFrame(() => {
                results.classList.add("show");
            });
            currentScreen = "results";
            break;

        default:
            console.warn(`Unknown screen: ${screen}`);
            showScreen("home");
    }
}

export function getCurrentScreen() {
    return currentScreen;
}