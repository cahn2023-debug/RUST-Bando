# PMP Collaboration Apps Script

This folder contains the Google Apps Script coordinator for Drive-backed PMP collaboration.

## Deploy

1. Create a standalone Apps Script project.
2. Copy `Code.gs` and `appsscript.json` into the project.
3. In Google Drive, create or choose a root folder inside the Shared Drive, for example `PMP-Collaboration`.
4. In Apps Script `Project Settings > Script Properties`, set:

```text
PMP_ROOT_FOLDER_ID=<shared-drive-folder-id>
PMP_SHARED_SECRET=<long-random-secret>
```

`PMP_SHARED_SECRET` is optional, but recommended. If it is set, every app request must include the same secret.

5. Deploy as Web App:

```text
Execute as: Me
Who has access: Anyone within your Workspace domain
```

6. Put the Web App `/exec` URL and secret into the desktop app environment:

```text
VITE_COLLAB_COORDINATOR_URL=https://script.google.com/macros/s/<deployment-id>/exec
VITE_COLLAB_SHARED_SECRET=<long-random-secret>
```

The Tauri app calls this URL through the Rust `post_collaboration_json` command to avoid WebView CORS issues.

## API

All requests are JSON `POST` bodies:

```json
{
  "action": "health",
  "secret": "optional-shared-secret",
  "request": {}
}
```

Supported actions:

- `commitBatch`
- `pullEvents`
- `acquireLease`
- `renewLease`
- `releaseLease`
- `resolveConflict`
- `claimSnapshot`
- `publishSnapshot`
- `health`

## Smoke Test

Use the deployed URL with an HTTP client:

```json
{
  "action": "health",
  "secret": "<secret>",
  "request": {
    "projectId": "00000000-0000-5000-8000-000000000001"
  }
}
```

Then send a one-event `commitBatch`, followed by `pullEvents` with `afterSeq: 0`. The pull response should include the event and a positive `seqEnd`.
