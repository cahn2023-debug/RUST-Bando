# scripts/index_system.ps1
# Final robust indexing for Graph-It-Live

$outputFile = "CODEBASE_MAP.md"
$currentDir = (Get-Location).Path
$header = "# Project Codebase Map`nGenerated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n"
$header | Out-File -FilePath $outputFile -Encoding utf8

$extensions = @("*.tsx", "*.ts", "*.css", "*.rs", "package.json", "Cargo.toml", "tauri.conf.json")
$scanDirs = @("src", "src-tauri")

$excludePatterns = @("node_modules", "target", "dist", ".git", "Resources")

Write-Host "Aggregating codebase into $outputFile..."
Write-Host "Project Root: $currentDir"

foreach ($dir in $scanDirs) {
    if (Test-Path $dir) {
        Write-Host "Scanning directory: $dir"
        foreach ($ext in $extensions) {
            $files = Get-ChildItem -Path $dir -Filter $ext -Recurse -File -ErrorAction SilentlyContinue
            foreach ($file in $files) {
                # Check exclusion
                $isExcluded = $false
                foreach ($exclude in $excludePatterns) {
                    if ($file.FullName -like "*\$exclude\*") {
                        $isExcluded = $true
                        break
                    }
                }
                
                if (-not $isExcluded) {
                    $relativePath = $file.FullName.Replace($currentDir + "\", "")
                    Write-Host "Indexing: $relativePath"
                    
                    $fileExt = $file.Extension.Replace('.', '')
                    $bt = [char]96
                    $backticks = "$bt$bt$bt"
                    
                    "`n## File: $relativePath`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
                    "$backticks$fileExt" | Out-File -FilePath $outputFile -Append -Encoding utf8
                    Get-Content -Path $file.FullName | Out-File -FilePath $outputFile -Append -Encoding utf8
                    "$backticks" | Out-File -FilePath $outputFile -Append -Encoding utf8
                }
            }
        }
    }
}

# Also include root config files
$rootFiles = @("package.json", "Cargo.toml", "tauri.conf.json", "DesignFeatures_utf8.tsx")
foreach ($rf in $rootFiles) {
    if (Test-Path $rf) {
        $file = Get-Item $rf
        $relativePath = $rf
        Write-Host "Indexing Root File: $relativePath"
        $fileExt = $file.Extension.Replace('.', '')
        $bt = [char]96
        $backticks = "$bt$bt$bt"
        "`n## File: $relativePath`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
        "$backticks$fileExt" | Out-File -FilePath $outputFile -Append -Encoding utf8
        Get-Content -Path $file.FullName | Out-File -FilePath $outputFile -Append -Encoding utf8
        "$backticks" | Out-File -FilePath $outputFile -Append -Encoding utf8
    }
}

Write-Host "Indexing complete. Final size: $((Get-Item $outputFile).Length) bytes"
