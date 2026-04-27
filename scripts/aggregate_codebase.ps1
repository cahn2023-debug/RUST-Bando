# aggregate_codebase.ps1
# Script to aggregate source code for Graph-it-Live extension

$outputFile = "CODEBASE_MAP.md"
$header = "# Project Codebase Map`nGenerated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n"
$header | Out-File -FilePath $outputFile -Encoding utf8

$includePatterns = @(
    "src/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.css",
    "src-tauri/src/**/*.rs",
    "package.json",
    "Cargo.toml",
    "tauri.conf.json"
)

$excludePatterns = @(
    "**/node_modules/**",
    "**/target/**",
    "**/dist/**",
    "**/.git/**"
)

Write-Host "Aggregating codebase into $outputFile..."

foreach ($pattern in $includePatterns) {
    $files = Get-ChildItem -Path $pattern -File -Recurse -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        # Check exclusion
        $skip = $false
        foreach ($exclude in $excludePatterns) {
            if ($file.FullName -like "*$($exclude.Replace('**/', '').Replace('/**', ''))*") {
                $skip = $true
                break
            }
        }
        
        if (-not $skip) {
            Write-Host "Processing: $($file.FullName)"
            $relativePath = $file.FullName.Replace('D:\Code Antinigaty\Phan mem quan ly file V4\RUST\', '')
            $ext = $file.Extension.Replace('.', '')
            
            # Use ASCII 96 for backticks to avoid parser issues
            $bt = [char]96
            $backticks = "$bt$bt$bt"
            
            "`n## File: $relativePath`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
            "$backticks$ext" | Out-File -FilePath $outputFile -Append -Encoding utf8
            Get-Content -Path $file.FullName | Out-File -FilePath $outputFile -Append -Encoding utf8
            "$backticks" | Out-File -FilePath $outputFile -Append -Encoding utf8
        }
    }
}

Write-Host "Aggregation complete. Saved to $outputFile"
