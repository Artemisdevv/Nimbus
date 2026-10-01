const themeToggle = document.getElementById("theme-toggle");

const savedTheme = localStorage.getItem("nimbus-theme");

if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
} else {
    document.documentElement.dataset.theme = "midnight";
}

themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    const next = current === "midnight" ? "daylight" : "midnight";

    document.documentElement.dataset.theme = next;
    localStorage.setItem("nimbus-theme", next);
});