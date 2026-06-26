# Makefile — one-command spin-up for the GPU Farm Utilization Dashboard.
#
#   make          fresh start: stop any old server, serve, and open the browser
#   make stop     stop the local server
#   make clean    remove stray test artifacts (.playwright-mcp)
#   make help     list targets
#
# The dashboard is fully static (reads data/*.csv via fetch) — it just needs a
# local HTTP server. Press Ctrl+C to stop. Requires python3 (built into macOS).

PORT ?= 8000
HOST := 127.0.0.1
URL  := http://$(HOST):$(PORT)/index.html

.DEFAULT_GOAL := up
.PHONY: up serve stop clean help

up: stop serve   ## Fresh start: stop any stale server, then serve + open the browser

serve:   ## Serve the dashboard over HTTP and open it in the default browser
	@echo "→ GPU Farm Dashboard: $(URL)   (press Ctrl+C to stop)"
	@( sleep 1 ; open "$(URL)" ) >/dev/null 2>&1 &
	@python3 -m http.server $(PORT) --bind $(HOST) --directory "$(CURDIR)"

stop:    ## Stop any http.server running on this port
	@pkill -f "http.server $(PORT)" 2>/dev/null && echo "Stopped server on :$(PORT)" || echo "No server running on :$(PORT)"

clean:   ## Remove stray test/screenshot artifacts
	@rm -rf .playwright-mcp
	@echo "Cleaned test artifacts."

help:    ## Show available targets
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | sed -E 's/^([a-z]+):.*## /  make \1\t— /' | sort
