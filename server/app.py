"""
Beyond Sundays — local static preview server.

Serves the static site (index.html, topic.html, story.html, css/, js/,
assets/) so you can view it at http://localhost:5000 without deploying.

RSVP capture and SMS reminders now run on Netlify (Netlify Forms +
netlify/functions/send-reminders.mjs), not here — so RSVP submissions on
this local server won't actually go anywhere; the page falls back to a
local-only confirmation instead. To test the real form + reminder flow,
install the Netlify CLI and run `netlify dev` from the project root, which
emulates Netlify Forms and Functions locally.

Run with:

    cd server
    pip install -r requirements.txt
    python app.py
"""

from __future__ import annotations

import os

from flask import Flask, jsonify, send_from_directory

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Only these top-level items are ever served — the server/ directory is
# never exposed, unlike a blanket static_folder=ROOT_DIR would do.
FRONTEND_PAGES = {"index.html", "topic.html", "story.html"}
FRONTEND_DIRS = {"css", "js", "assets"}

app = Flask(__name__)


@app.route("/")
def home():
    return send_from_directory(ROOT_DIR, "index.html")


@app.route("/<page>")
def page(page):
    if page not in FRONTEND_PAGES:
        return jsonify({"ok": False, "error": "Not found."}), 404
    return send_from_directory(ROOT_DIR, page)


@app.route("/<directory>/<path:filename>")
def asset(directory, filename):
    if directory not in FRONTEND_DIRS:
        return jsonify({"ok": False, "error": "Not found."}), 404
    return send_from_directory(os.path.join(ROOT_DIR, directory), filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
