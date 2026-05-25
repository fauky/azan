#!/usr/bin/env python3
"""
server.py — Azan Dashboard Web Server
======================================
A lightweight HTTP server designed to serve the Azan Dashboard application.
It serves static assets and provides a simple API to list audio files.

Dependencies: Python 3.x Standard Library
"""

import argparse
import http.server
import json
import os
import socketserver
import sys
import urllib.parse

# ==============================================================================
# CONFIGURATION & CONSTANTS
# ==============================================================================

# Network Defaults
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8080

# File System Paths
# Determine the absolute path to the 'static' directory relative to this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# MIME Type Mappings
# Extends the default system types to ensure correct rendering on all clients
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ttf":  "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ico":  "image/x-icon",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".svg":  "image/svg+xml",
}

# ==============================================================================
# REQUEST HANDLER
# ==============================================================================

class AzanHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom HTTP Request Handler for the Azan Dashboard.
    Extends SimpleHTTPRequestHandler to add API endpoints and custom headers.
    """

    def __init__(self, *args, **kwargs):
        # Initialize with the specific static directory
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        """Handle GET requests, intercepting API calls."""
        # Parse the URL to separate path and query parameters
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip('/')

        # API Endpoint: List files in a directory (used for audio discovery)
        if path == '/list-files':
            self.handle_api_list_files(parsed_url.query)
            return

        # Default: Serve static files
        return super().do_GET()

    def handle_api_list_files(self, query_string):
        """
        API Logic: Lists non-hidden files in a specified subdirectory.
        
        Args:
            query_string (str): The raw query string from the URL.
        """
        params = urllib.parse.parse_qs(query_string)
        dir_param = params.get('dir', [None])[0]

        if not dir_param:
            self.send_error(400, "Bad Request: 'dir' parameter is required.")
            return

        # Decode and sanitize the requested path
        # unquote ensures %20 -> space, etc.
        relative_path = urllib.parse.unquote(dir_param).lstrip('/\\')
        
        # Resolve absolute paths for security check
        abs_static_dir = os.path.realpath(STATIC_DIR)
        target_dir = os.path.realpath(os.path.join(abs_static_dir, relative_path))

        # Security: Ensure the target directory is actually inside STATIC_DIR
        # os.path.commonpath raises ValueError on Windows if drives differ, handle gracefully
        try:
            is_safe = os.path.commonpath([abs_static_dir, target_dir]) == abs_static_dir
        except ValueError:
            is_safe = False

        if not is_safe or not os.path.isdir(target_dir):
            self.log_message("Security alert or 404: %s", target_dir)
            self.send_error(404, f"Directory not found or access denied: {relative_path}")
            return

        try:
            # List files, filtering out dotfiles and subdirectories
            files = []
            for entry in os.listdir(target_dir):
                full_entry_path = os.path.join(target_dir, entry)
                if os.path.isfile(full_entry_path) and not entry.startswith('.'):
                    # Construct the web-accessible path (forward slashes)
                    web_path = os.path.join(relative_path, entry).replace('\\', '/')
                    files.append(web_path)

            # Send JSON response
            response_data = json.dumps(files).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_data)))
            self.end_headers()
            self.wfile.write(response_data)

        except Exception as e:
            self.log_error("Error listing directory '%s': %s", target_dir, e)
            self.send_error(500, "Internal Server Error")

    def guess_type(self, path):
        """
        Override MIME type guessing to use our strict mapping first.
        This ensures consistent behavior across different OS environments.
        """
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME_TYPES:
            return MIME_TYPES[ext]
        return super().guess_type(path)

    def end_headers(self):
        """Add custom headers to every response."""
        # CORS: Allow access from any origin (useful for development/kiosk modes)
        self.send_header("Access-Control-Allow-Origin", "*")
        
        # Caching: Disable caching to ensure config changes apply immediately on reload
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        
        super().end_headers()

    def log_message(self, fmt, *args):
        """Custom log format for cleaner console output."""
        sys.stdout.write("[azan] %s - %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

def run_server():
    """Parses arguments and starts the TCP server."""
    parser = argparse.ArgumentParser(description="Azan Dashboard Web Server")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Bind host (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    # Verify static directory exists before starting
    if not os.path.isdir(STATIC_DIR):
        sys.stderr.write(f"CRITICAL ERROR: Static directory not found at: {STATIC_DIR}\n")
        sys.exit(1)

    # Allow address reuse to prevent "Address already in use" errors on restart
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer((args.host, args.port), AzanHandler) as httpd:
        print(f"╔══════════════════════════════════════════╗")
        print(f"║       Azan Dashboard Server              ║")
        print(f"╠══════════════════════════════════════════╣")
        print(f"║  Serving:  {STATIC_DIR}")
        print(f"║  URL:      http://{args.host}:{args.port}/")
        print(f"║  Local:    http://127.0.0.1:{args.port}/")
        print(f"║  Press Ctrl+C to stop                    ║")
        print(f"╚══════════════════════════════════════════╝")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[azan] Server stopped by user.")
        except Exception as e:
            print(f"\n[azan] Server error: {e}")

if __name__ == "__main__":
    run_server()
