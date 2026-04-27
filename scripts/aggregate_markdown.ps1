# scripts/aggregate_markdown.ps1
$outputFile = "docs/NOTEBOOK_LM_V2.md"
$header = "# Project Documentation Bundle for NotebookLM (V2)`nGenerated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n"
$header | Out-File -FilePath $outputFile -Encoding utf8

$scanPaths = @(".", "docs", "src", "src-tauri", "Resources/references")
$allFiles = @()

foreach ($path in $scanPaths) {
    if (Test-Path $path) {
        $files = Get-ChildItem -Path $path -Filter *.md -File -Recurse -ErrorAction SilentlyContinue
        $allFiles += $files
    }
}

$processedFiles = @{}

Write-Host "Aggregating markdown files..."
$currentDir = (Get-Location).Path

foreach ($file in $allFiles) {
    if ($processedFiles.ContainsKey($file.FullName)) { continue }
    if ($file.Name -eq "CODEBASE_MAP.md") { continue }
    if ($file.Name -like "*NOTEBOOK_LM*") { continue }
    if ($file.FullName -like "*\node_modules\*") { continue }
    if ($file.FullName -like "*\.git\*") { continue }

    $processedFiles[$file.FullName] = $true
    $relativePath = $file.FullName.Replace($currentDir + "\", "")
    Write-Host "Processing: $relativePath ($($file.Length) bytes)"
    
    "`n---`n## File Source: $relativePath`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
    try {
        Get-Content -Path $file.FullName | Out-File -FilePath $outputFile -Append -Encoding utf8
    }
    catch {
        Write-Warning "Failed to read $relativePath"
    }
    "`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
}

Write-Host "Aggregation complete. Saved to $outputFile"
