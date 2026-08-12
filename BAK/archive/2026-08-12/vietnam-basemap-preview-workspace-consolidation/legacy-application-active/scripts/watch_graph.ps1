while($true) {
    Write-Host "Updating Knowledge Graph..." -ForegroundColor Cyan
    python scripts/graph_generator.py
    Start-Sleep -Seconds 5
}
