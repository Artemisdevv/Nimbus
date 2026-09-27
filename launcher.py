import os
import webview
from app import Api

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Persistent WebView storage
STORAGE_DIR = os.path.join(os.getenv("APPDATA"), "Nimbus", "webview")
os.makedirs(STORAGE_DIR, exist_ok=True)

api = Api()

window = webview.create_window(
    "Nimbus",
    os.path.join(BASE_DIR, "frontend", "index.html"),
    js_api=api
)

webview.start(
    debug=True,
    private_mode=False,
    storage_path=STORAGE_DIR
)