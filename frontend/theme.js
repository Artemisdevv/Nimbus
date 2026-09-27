const themeBT = document.getElementById("themeBT");
const themeMenu = document.getElementById("theme-menu");

const savedTheme = localStorage.getItem("nimbus-theme");

if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
}

themeBT.addEventListener("click", () => {
    themeMenu.classList.toggle("open");
});

themeMenu.addEventListener("click", (event) => {
    const theme = event.target.dataset.theme;

    if (!theme) return;

    document.documentElement.dataset.theme = theme;
    localStorage.setItem("nimbus-theme", theme);

    themeMenu.classList.remove("open");
});