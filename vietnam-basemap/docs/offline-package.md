# Offline Package Integration

basemap_offline::OfflinePackage is the local adapter boundary for desktop
clients. It opens a versioned release directory, validates the shared manifest,
checks every declared style and asset, and returns only package-contained
paths/content.

The adapter rejects incompatible contract versions, missing assets, unsafe
paths, and external HTTP/CDN resources in styles before a renderer receives
the package. It does not access the network.

The MapLibre/Tauri integration layer is responsible for mapping the stable
offline placeholders in style JSON to its local protocol. The package reader
does not depend on MapLibre or Tauri.
