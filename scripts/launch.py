"""Start the local backend, wait for health, then open the user's browser."""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADDRESS = 'http://127.0.0.1:8765'


def main():
    # Avoid silently opening an unrelated process or running two database workers.
    with socket.socket() as port:
        try:
            port.bind(('127.0.0.1', 8765))
        except OSError:
            print('Port 8765 is already occupied. Stop the existing process before starting Short Studio.')
            return 1
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8765'], cwd=ROOT)
    try:
        for _ in range(120):
            if process.poll() is not None:
                return process.returncode
            try:
                with urllib.request.urlopen(ADDRESS + '/api/health', timeout=1) as response:
                    if json.load(response).get('tts_model') == 'gemini-3.8-flash-tts':
                        if os.getenv('SHORT_STUDIO_NO_BROWSER') != '1':
                            webbrowser.open(ADDRESS)
                        print('Short Studio is running locally. Keep this window open. Ctrl+C stops the app.')
                        return process.wait()
            except (OSError, ValueError, urllib.error.URLError):
                time.sleep(.25)
        print('Startup timed out. Check the backend log above.')
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    raise SystemExit(main())
