import yt_dlp
import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DENO_PATH = os.path.join(BASE_DIR, "deno", "deno.exe")
FFMPEG_PATH = os.path.join(BASE_DIR, "ffmpeg")

class Api:
    def __init__(self):
        self.progress = {
            "percent": "0%",
            "speed": "Unknown",
            "eta": "Unknown"
        }

    def ping(self):
        return "pong"

    def get_progress(self):
        return self.progress

    def get_video_info(self, url):

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

    def download(self, url, format_id, format_type):
        self.progress = {
            "percent": "0%",
            "speed": "Unknown",
            "eta": "Unknown"
        }

        def progress_hook(d):
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

                self.progress = {
                    "percent": f"{percent:.1f}%",
                    "speed": speed_text,
                    "eta": eta_text
                }

            elif d["status"] == "finished":
                self.progress = {
                    "percent": "100%",
                    "speed": "Done",
                    "eta": "00:00"
                }


        ydl_opts = {
            "js_runtimes": {
                "deno": {
                    "path": DENO_PATH
                }
            },
            "outtmpl": "~/Downloads/%(title)s.%(ext)s",
            "progress_hooks": [progress_hook],
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

            return True

        except Exception as e:
            print(e)
            return False