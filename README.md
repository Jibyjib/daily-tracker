# Daily Tracker

A lightweight, file-backed daily habit + task tracker.

This app runs entirely locally in your browser. You can double-click `index.html` to use it. Data can be stored in a JSON file on disk using Chrome/Edge’s File System Access API.

---

## Features

- Daily recurring habit tracking
- One-off task tracking
- Optional due dates and categories
- Habit streak calculation
- Look-back stats:
  - Last 7 days
  - Last 30 days
  - Last 90 days
  - Overall completion %
- File-backed autosave (JSON)
- Fallback to localStorage
- Import / Export JSON
- No backend, no database, no dependencies

---

## How To Use

### 1. Clone or download

```bash
git clone https://github.com/Jibyjib/daily-tracker.git
cd daily-tracker
```

Or just download the ZIP.

---

### 2. Open the app

Double-click:

```
index.html
```

Open it in **Chrome or Edge** (required for file-backed storage).

---

## Connecting a Data File

To store your data in a real file:

1. Click **Connect file**
2. Choose a location
3. Name it:

```
tracker-data.json
```

4. Click Save

After that:

- All changes autosave to that file
- Data is mirrored in localStorage as backup

### Important

Because of browser security restrictions:

You must reconnect the file each time you reopen the page.

This is normal browser behavior.

---

## File Structure

```
daily-tracker/
├── index.html
├── styles.css
├── app.js
├── .gitignore
└── tracker-data.json   (not committed)
```

`.gitignore` excludes your live data file from Git.

---

## Data Format

The JSON file looks like:

```json
{
  "habits": [
    {
      "id": "...",
      "name": "Exercise",
      "history": {
        "2026-02-26": true
      }
    }
  ],
  "tasks": [
    {
      "id": "...",
      "name": "Submit form",
      "due": "2026-03-01",
      "cat": "admin",
      "done": false,
      "created": 1700000000000
    }
  ],
  "taskFilter": "all"
}
```

---

## Recommended Setup

If you want syncing across machines:

Put the project folder inside:

- Dropbox
- Google Drive
- OneDrive

Connect your JSON file inside that synced folder.

Now your tracker data syncs automatically.

---

## Git Workflow

After changes:

```bash
git add .
git commit -m "Describe changes"
git push
```

---

## Optional: GitHub Pages

You can deploy this as a static site:

1. Repo → Settings → Pages  
2. Source: Deploy from branch  
3. Branch: `main`  
4. Folder: `/ (root)`

Then access it at:

```
https://jibyjib.github.io/daily-tracker
```

Note: File-backed storage only works when running locally, not via GitHub Pages.

---

## Future Improvements

Possible upgrades:

- Weekly / custom frequency habits
- Drag-and-drop habit ordering
- Calendar heatmap view
- PWA (installable app mode)
- Reconnect persistence via service worker
- SQLite-backed local server version

---

## License

MIT
