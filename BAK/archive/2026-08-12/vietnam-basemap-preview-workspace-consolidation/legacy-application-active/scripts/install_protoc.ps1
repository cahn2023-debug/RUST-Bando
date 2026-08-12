$protocVersion = "26.1"
$url = "https://github.com/protocolbuffers/protobuf/releases/download/v$protocVersion/protoc-$protocVersion-win64.zip"
$destZip = "src-tauri/protoc.zip"
$destDir = "src-tauri/tools/protoc"

if (!(Test-Path -Path "src-tauri/tools")) { New-Item -ItemType Directory -Path "src-tauri/tools" }

Write-Host "Downloading protoc v$protocVersion..."
Invoke-WebRequest -Uri $url -OutFile $destZip

Write-Host "Extracting to $destDir..."
Expand-Archive -Path $destZip -DestinationPath $destDir -Force

Remove-Item -Path $destZip

Write-Host "Successfully installed protoc to $destDir"
