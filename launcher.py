import os
import webview
from app import Api

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

api = Api()

window = webview.create_window(
    "Nimbus",
    os.path.join(BASE_DIR, "frontend", "index.html"),
    js_api=api
)

webview.start()