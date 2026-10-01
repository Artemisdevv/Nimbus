import yt_dlp
import os
import threading
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DENO_PATH = os.path.join(BASE_DIR, "deno", "deno.exe")
FFMPEG_PATH = os.path.join(BASE_DIR, "ffmpeg")


def normalize_youtube_url(url: str) -> str:
    """
    Strip incidental YouTube Mix/radio parameters from single-video URLs.
    
    YouTube adds `list=RD...&start_radio=1` (and sometimes `index=`) to video URLs
    when opened from Mix/radio. These cause yt-dlp to treat the URL as a playlist.
    
    Legitimate playlist URLs (e.g. youtube.com/playlist?list=PL...) or video URLs
    where the user explicitly includes a non-RD playlist are preserved.
    """
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        
        # Only process YouTube domains
        if not any(h in host for h in ("youtube.com", "youtu.be")):
            return url
        
        qs = parse_qs(parsed.query, keep_blank_values=True)
        
        # Determine if this is a single-video URL
        is_video_url = False
        video_id = None
        
        if "youtu.be" in host:
            # youtu.be/VIDEO_ID[?params]
            path_parts = parsed.path.strip("/").split("/")
            if path_parts and path_parts[0]:
                video_id = path_parts[0]
                is_video_url = True
        elif "youtube.com" in host:
            # youtube.com/watch?v=VIDEO_ID
            if "v" in qs and qs["v"]:
                video_id = qs["v"][0]
                is_video_url = True
        
        if not is_video_url:
            # Not a single-video URL (could be playlist, channel, etc.) - leave alone
            return url
        
        # Check if the 'list' param is a YouTube Mix (RD...) radio playlist
        list_param = qs.get("list", [None])[0]
        is_mix_playlist = list_param and list_param.startswith("RD")
        
        # Parameters that indicate incidental Mix/radio context
        incidental_params = {"start_radio", "index"}
        
        # Remove incidental parameters if this is a Mix playlist context
        if is_mix_playlist:
            for param in incidental_params:
                qs.pop(param, None)
            # Also remove the RD... list itself since it's incidental
            qs.pop("list", None)
        
        # Rebuild URL
        new_query = urlencode(qs, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    except Exception:
        # On any parsing error, return original URL
        return url

class Api:
    def __init__(self):
        self.progress = {}
        self.downloadQ = []
        self.q_running = False
        self.cancelled_jobs = set()

    def ping(self):
        return "pong"

    def get_progress(self):
        return self.progress

    def cancel_download(self, uid):
        self.cancelled_jobs.add(uid)
        return True

    def get_video_info(self, url):
        # Normalize URL to strip incidental YouTube Mix/radio params
        url = normalize_youtube_url(url)

        ydl_opts = {
            "js_runtimes": {
                "deno": {
                    "path": DENO_PATH
                }
            }
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = []
        audio_formats = []

        video_formats = {}
        seen_audio = set()

        for f in info["formats"][::-1]:
            if f.get("vcodec") != "none":
                height = f.get("height")
                width = f.get("width")
                ext = f.get("ext", "")

                if not height or height < 720:
                    continue

                key = (width, height, ext)

                vcodec = f.get("vcodec", "")

                if vcodec.startswith("avc1"):
                    codec_priority = 0
                elif vcodec.startswith("vp9"):
                    codec_priority = 1
                elif vcodec.startswith("av01"):
                    codec_priority = 2
                else:
                    codec_priority = 3

                current = video_formats.get(key)

                if current is None or codec_priority < current[0]:
                    video_formats[key] = (codec_priority, f)

            elif f.get("acodec") != "none":
                bitrate = f.get("abr")

                if not bitrate:
                    continue

                if bitrate in seen_audio:
                    continue

                seen_audio.add(bitrate)

                print(
                    "AUDIO:",
                    f.get("format_id"),
                    f.get("abr"),
                    f.get("acodec"),
                    f.get("ext")
                )

                audio_formats.append({
                    "format_id": f["format_id"],
                    "type": "audio",
                    "bitrate": bitrate,
                    "ext": f.get("ext"),
                    "codec": f.get("acodec"),
                    "label": f"{int(bitrate)} kbps Audio"
                })

        for _, f in video_formats.values():
            height = f.get("height")
            width = f.get("width")
            ext = f.get("ext", "")
            fps = f.get("fps")

            if width:
                resolution = f"{width}x{height}"
            else:
                resolution = f"{height}p"

            label = f"{resolution} {ext}"

            if fps:
                label += f" {fps}fps"

            formats.append({
                "format_id": f["format_id"],
                "type": "video",
                "height": height,
                "ext": ext,
                "fps": fps,
                "label": label
            })

        formats.sort(
            key=lambda f: (
                f["type"] != "video",
                -f.get("height", 0),
                -f.get("bitrate", 0)
            )
        )

        audio_formats.sort(
            key=lambda f: f["bitrate"],
            reverse=True
        )

        formats.extend(audio_formats[:3])
                
        return {
            "title": info.get("title"),
            "duration": info.get("duration"),
            "channel": info.get("channel"),
            "thumbnail": info.get("thumbnail"),
            "formats": formats
        }

    def start_queue(self):
        self.q_running = True

        thread = threading.Thread(
            target=self.process_queue,
            daemon=True
        )
        thread.start()

    def add_to_queue(self, item):
        self.downloadQ.append(item)

        return True
    
    def start_downloads(self):
        if not self.q_running and self.downloadQ:
            self.start_queue()

        return True

    def remove_from_queue(self, uid):
        for item in self.downloadQ:
            if item["id"] == uid:
                self.downloadQ.remove(item)
                return True

        self.cancel_download(uid)
        return True
    def start_downloads(self):
        if not self.q_running and self.downloadQ:
            self.start_queue()

        return True
    def process_queue(self):
        while self.downloadQ:
            item = self.downloadQ.pop(0)

            self.download(
                item["id"],
                item["url"],
                item["format_id"],
                item["format_type"]
            )

        self.q_running = False


    def download(self,uid, url, format_id, format_type):
        # Normalize URL to strip incidental YouTube Mix/radio params
        url = normalize_youtube_url(url)

        self.progress[uid] = {
            "id":uid,
            "status":"downloading",
            "percent": "0%",
            "speed": "Unknown",
            "eta": "Unknown"
        }

        def progress_hook(d):
            if uid in self.cancelled_jobs:
                raise yt_dlp.utils.DownloadError("Download Cancelled")


            if d["status"] == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate")

                if total:
                    percent = (downloaded / total) * 100
                else:
                    percent = 0

                speed = d.get("speed")
                eta = d.get("eta")

                if speed:
                    speed_mib = speed / (1024 * 1024)
                    speed_text = f"{speed_mib:.2f} MiB/s"
                else:
                    speed_text = "Unknown"

                if eta is not None:
                    minutes, seconds = divmod(eta, 60)
                    eta_text = f"{int(minutes):02d}:{int(seconds):02d}"
                else:
                    eta_text = "Unknown"

                self.progress[uid] = {
                    "id": uid,
                    "status":"downloading",
                    "percent": f"{percent:.1f}%",
                    "speed": speed_text,
                    "eta": eta_text,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total
                }

            elif d["status"] == "finished":
                # Download of a stream finished; post-processors may still run.
                # Mark as processing; postprocessor_hook will keep it there,
                # and we'll mark completed after ydl.download() returns.
                self.progress[uid] = {
                    "id": uid,
                    "status": "processing",
                    "percent": None,
                    "speed": "Processing…",
                    "eta": "—",
                    "downloaded_bytes": d.get("total_bytes") or d.get("total_bytes_estimate"),
                    "total_bytes": d.get("total_bytes") or d.get("total_bytes_estimate")
                }

        def postprocessor_hook(d):
            # Any post-processor start means we're in processing phase.
            # Keep status as "processing" through all post-processors.
            if d["status"] == "started":
                self.progress[uid] = {
                    "id": uid,
                    "status": "processing",
                    "percent": None,
                    "speed": "Processing…",
                    "eta": "—",
                    "downloaded_bytes": d.get("total_bytes") or d.get("total_bytes_estimate"),
                    "total_bytes": d.get("total_bytes") or d.get("total_bytes_estimate")
                }


        ydl_opts = {
            "js_runtimes": {
                "deno": {
                    "path": DENO_PATH
                }
            },
            "outtmpl": "~/Downloads/%(title)s.%(ext)s",
            "progress_hooks": [progress_hook],
            "postprocessor_hooks": [postprocessor_hook],
        }

        if format_type == "video":
            ydl_opts.update({
                "format": f"{format_id}+bestaudio/best",
                "merge_output_format": "mp4",
                "ffmpeg_location": FFMPEG_PATH,
            })

        elif format_type == "audio":
            ydl_opts.update({
                "format": format_id,
            })

        else:
            raise ValueError("Invalid format type")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # All post-processors finished successfully
            self.progress[uid] = {
                "id": uid,
                "status": "completed",
                "percent": "100%",
                "speed": "Done",
                "eta": "00:00",
                "downloaded_bytes": self.progress[uid].get("total_bytes"),
                "total_bytes": self.progress[uid].get("total_bytes")
            }
            return True

        except Exception as e:
            print(e)
            # Mark as error if not cancelled
            if uid not in self.cancelled_jobs:
                self.progress[uid] = {
                    "id": uid,
                    "status": "error",
                    "percent": None,
                    "speed": "Error",
                    "eta": "—",
                    "downloaded_bytes": self.progress[uid].get("downloaded_bytes"),
                    "total_bytes": self.progress[uid].get("total_bytes")
                }
            return False
        
        finally:
            self.cancelled_jobs.discard(uid)