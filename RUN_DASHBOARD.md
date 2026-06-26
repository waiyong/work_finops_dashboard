# How to Open the GPU Farm Dashboard

A quick, non-technical guide to launching the dashboard on a **Mac**. Takes about 30 seconds.

> **Why not just double-click `index.html`?** The dashboard loads its numbers from data files (CSVs) next to it, and modern browsers block that when the page is opened directly — so it would show a red "Failed to load dashboard data" banner. The steps below run a tiny local viewer that fixes this. Nothing is installed and nothing leaves your computer.

---

## Before you start
- **No internet required** — everything (the charts' drawing library and the data) is included in the folder and runs locally.
- These steps use the **Terminal** app, which comes built into every Mac. No software to install.

---

## Steps

### 1. Open Terminal
Press **⌘ (Command) + Spacebar**, type **Terminal**, and press **Return**.

### 2. Copy and paste this one line, then press Return
```bash
cd /Users/waiyong/Documents/Upper_Management_Report && python3 -m http.server 8000
```
You'll see a message like `Serving HTTP on :: port 8000 ...`. That means it's working. **Leave this window open** while you use the dashboard.

### 3. Open the dashboard in your browser
Go to your web browser (Safari or Chrome) and visit:
```
http://127.0.0.1:8000/index.html
```
The dashboard should appear. You can now use the **All / SUPERPOD / PROD** switch at the top right, the **Output / Input / Total** toggle, and click chart segments to drill down.

---

## When you're finished
Go back to the Terminal window and press **Control + C** to stop the viewer. You can then close Terminal.

---

## If something goes wrong

**The page says "Error code: 404 – File not found"**
A leftover viewer is probably still running from before. In Terminal, paste this, press Return, then go back to Step 2:
```bash
pkill -f "http.server"
```

**"Address already in use"**
Same cause as above — run the `pkill` line, then try Step 2 again. (Or use a different port: change `8000` to `8080` in both the command and the web address.)

**The charts don't appear / look blank**
Refresh the page (**⌘ + R**). Make sure you opened the **http://127.0.0.1:8000/…** address (Step 3), not the file directly — the dashboard loads its data from files next to it, which only works through the local viewer.

**Nothing happens after pasting the command**
Make sure you're pasting into the **Terminal** window (not the browser), and that you pressed **Return**.

---

## Tip
Bookmark **http://127.0.0.1:8000/index.html** in your browser so it's one click next time. You'll still need to run Step 2 first each time you want to view it.
